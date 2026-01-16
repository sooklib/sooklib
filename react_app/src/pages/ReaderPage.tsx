import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Slider, ToggleButtonGroup, ToggleButton, CircularProgress,
  Alert, AppBar, Toolbar, Divider
} from '@mui/material'
import {
  ArrowBack, Menu, Settings, TextFields, FormatLineSpacing,
  ChevronLeft, ChevronRight
} from '@mui/icons-material'
import ePub, { Book, Rendition, NavItem } from 'epubjs'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface Chapter {
  title: string
  startIndex: number
  endIndex: number
}

interface EpubTocItem {
  label: string
  href: string
  subitems?: EpubTocItem[]
}

interface ReadingProgress {
  progress: number
  position: string | null
  finished: boolean
}

// 主题预设
const themes = {
  dark: { bg: '#1a1a1a', text: '#e0e0e0' },
  sepia: { bg: '#f4ecd8', text: '#5b4636' },
  light: { bg: '#ffffff', text: '#333333' },
  green: { bg: '#c7edcc', text: '#2d4a32' },
}

export default function ReaderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const contentRef = useRef<HTMLDivElement>(null)
  const epubViewerRef = useRef<HTMLDivElement>(null)
  
  // 状态
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [content, setContent] = useState('')
  const [bookInfo, setBookInfo] = useState<{ title: string; format: string } | null>(null)
  const [isEpub, setIsEpub] = useState(false)
  
  // EPUB 相关
  const [epubBook, setEpubBook] = useState<Book | null>(null)
  const [epubRendition, setEpubRendition] = useState<Rendition | null>(null)
  const [epubToc, setEpubToc] = useState<EpubTocItem[]>([])
  
  // TXT 章节
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [currentChapter, setCurrentChapter] = useState(0)
  
  // 设置
  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [theme, setTheme] = useState<keyof typeof themes>('dark')
  
  // 抽屉
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  // 进度
  const [progress, setProgress] = useState(0)
  const [savedProgress, setSavedProgress] = useState<number | null>(null)
  const [contentLoaded, setContentLoaded] = useState(false)

  // 加载书籍信息
  useEffect(() => {
    if (id) {
      loadBook()
    }
    return () => {
      // 清理 EPUB
      if (epubBook) {
        epubBook.destroy()
      }
    }
  }, [id])

  // 保存进度（防抖）- 减少延迟到1秒
  useEffect(() => {
    const timer = setTimeout(() => {
      if (progress > 0 && id) {
        saveProgress()
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [progress])

  // 页面卸载时保存进度
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (progress > 0 && id) {
        // 使用 sendBeacon 确保页面关闭前发送
        const data = JSON.stringify({
          progress: progress,
          position: null,
          finished: progress >= 0.98,
        })
        navigator.sendBeacon(
          `/api/progress/${id}`,
          new Blob([data], { type: 'application/json' })
        )
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [progress, id])

  // 加载保存的设置
  useEffect(() => {
    const savedSettings = localStorage.getItem('reader_settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.fontSize) setFontSize(settings.fontSize)
        if (settings.lineHeight) setLineHeight(settings.lineHeight)
        if (settings.theme) setTheme(settings.theme)
      } catch (e) {
        console.error('加载阅读设置失败:', e)
      }
    }
  }, [])

  // 保存设置
  useEffect(() => {
    localStorage.setItem('reader_settings', JSON.stringify({ fontSize, lineHeight, theme }))
  }, [fontSize, lineHeight, theme])

  // EPUB 主题应用
  useEffect(() => {
    if (epubRendition) {
      const currentTheme = themes[theme]
      epubRendition.themes.default({
        body: {
          background: currentTheme.bg,
          color: currentTheme.text,
          'font-size': `${fontSize}px`,
          'line-height': `${lineHeight}`,
        }
      })
    }
  }, [epubRendition, fontSize, lineHeight, theme])

  const loadBook = async () => {
    try {
      setLoading(true)
      setError('')

      // 先加载阅读进度
      try {
        const progressResponse = await api.get<ReadingProgress>(`/api/progress/${id}`)
        if (progressResponse.data.progress > 0) {
          setSavedProgress(progressResponse.data.progress)
        }
      } catch {
        console.log('无保存的阅读进度')
      }

      // 获取书籍信息
      const bookResponse = await api.get(`/api/books/${id}`)
      const format = bookResponse.data.file_format.toLowerCase()
      setBookInfo({
        title: bookResponse.data.title,
        format: format,
      })

      if (format === 'epub' || format === '.epub') {
        setIsEpub(true)
        await loadEpub()
      } else if (format === 'txt' || format === '.txt') {
        setIsEpub(false)
        await loadTxt()
        setContentLoaded(true)
      } else {
        setError(`暂不支持 ${format} 格式的在线阅读`)
      }
    } catch (err: unknown) {
      console.error('加载书籍失败:', err)
      setError('加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const loadTxt = async () => {
    const contentResponse = await api.get(`/api/books/${id}/content`)
    const data = contentResponse.data
    
    if (data.format === 'txt') {
      setContent(data.content)
      const parsedChapters = parseChapters(data.content)
      setChapters(parsedChapters)
    }
  }

  const loadEpub = async () => {
    try {
      // 获取 EPUB 文件 URL
      const epubUrl = `/api/books/${id}/content`
      
      // 创建 EPUB 书籍
      const book = ePub(epubUrl, {
        requestHeaders: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      setEpubBook(book)
      
      // 等待书籍加载
      await book.ready
      
      // 获取目录
      const navigation = await book.loaded.navigation
      if (navigation.toc) {
        setEpubToc(navigation.toc as EpubTocItem[])
      }
      
      // 渲染到容器
      if (epubViewerRef.current) {
        const rendition = book.renderTo(epubViewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none'
        })
        
        setEpubRendition(rendition)
        
        // 应用主题
        const currentTheme = themes[theme]
        rendition.themes.default({
          body: {
            background: currentTheme.bg,
            color: currentTheme.text,
            'font-size': `${fontSize}px`,
            'line-height': `${lineHeight}`,
          }
        })
        
        // 显示第一页
        await rendition.display()
        
        // 监听位置变化
        rendition.on('relocated', (location: any) => {
          const prog = book.locations.percentageFromCfi(location.start.cfi)
          setProgress(prog || 0)
        })
      }
    } catch (err) {
      console.error('加载 EPUB 失败:', err)
      setError('EPUB 加载失败')
    }
  }

  // TXT 内容加载后恢复进度
  useEffect(() => {
    if (contentLoaded && savedProgress !== null && !isEpub && contentRef.current) {
      // 等待 DOM 渲染完成
      setTimeout(() => {
        if (contentRef.current) {
          const scrollHeight = contentRef.current.scrollHeight - contentRef.current.clientHeight
          contentRef.current.scrollTop = scrollHeight * savedProgress
          setProgress(savedProgress)
          console.log(`已恢复阅读进度: ${Math.round(savedProgress * 100)}%`)
        }
      }, 300)
    }
  }, [contentLoaded, savedProgress, isEpub])

  // EPUB 渲染完成后恢复进度
  useEffect(() => {
    if (epubRendition && savedProgress !== null && epubBook) {
      // 等待 locations 生成
      epubBook.locations.generate(1024).then(() => {
        const cfi = epubBook.locations.cfiFromPercentage(savedProgress)
        if (cfi) {
          epubRendition.display(cfi)
          setProgress(savedProgress)
          console.log(`已恢复 EPUB 阅读进度: ${Math.round(savedProgress * 100)}%`)
        }
      })
    }
  }, [epubRendition, savedProgress, epubBook])

  const saveProgress = async () => {
    try {
      await api.post(`/api/progress/${id}`, {
        progress: progress,
        position: null,
        finished: progress >= 0.98,
      })
    } catch (err) {
      console.error('保存进度失败:', err)
    }
  }

  // 解析 TXT 章节
  const parseChapters = (text: string): Chapter[] => {
    const chapterPatterns = [
      /^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$/gm,
      /^Chapter\s+\d+.*$/gim,
      /^卷[零一二三四五六七八九十百千\d]+.*$/gm,
      /^【.+】$/gm,
    ]

    const chapters: Chapter[] = []
    let allMatches: Array<{ title: string; index: number }> = []

    for (const pattern of chapterPatterns) {
      let match
      const regex = new RegExp(pattern.source, pattern.flags)
      while ((match = regex.exec(text)) !== null) {
        allMatches.push({ title: match[0].trim(), index: match.index })
      }
    }

    allMatches.sort((a, b) => a.index - b.index)

    const filteredMatches: typeof allMatches = []
    for (const match of allMatches) {
      if (filteredMatches.length === 0 || match.index - filteredMatches[filteredMatches.length - 1].index > 100) {
        filteredMatches.push(match)
      }
    }

    for (let i = 0; i < filteredMatches.length; i++) {
      chapters.push({
        title: filteredMatches[i].title,
        startIndex: filteredMatches[i].index,
        endIndex: i < filteredMatches.length - 1 ? filteredMatches[i + 1].index : text.length,
      })
    }

    if (chapters.length === 0) {
      chapters.push({ title: '全文', startIndex: 0, endIndex: text.length })
    }

    return chapters
  }

  // TXT 滚动处理
  const handleScroll = useCallback(() => {
    if (contentRef.current && !isEpub) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current
      const newProgress = scrollTop / (scrollHeight - clientHeight)
      setProgress(Math.min(Math.max(newProgress, 0), 1))

      const currentPos = scrollTop + clientHeight / 2
      const contentTop = contentRef.current.offsetTop
      for (let i = chapters.length - 1; i >= 0; i--) {
        const chapterElement = document.getElementById(`chapter-${i}`)
        if (chapterElement && chapterElement.offsetTop - contentTop <= currentPos) {
          setCurrentChapter(i)
          break
        }
      }
    }
  }, [chapters, isEpub])

  // TXT 跳转章节
  const goToChapter = (index: number) => {
    setCurrentChapter(index)
    setTocOpen(false)
    const chapterElement = document.getElementById(`chapter-${index}`)
    if (chapterElement) {
      chapterElement.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // EPUB 跳转章节
  const goToEpubChapter = (href: string) => {
    setTocOpen(false)
    if (epubRendition) {
      epubRendition.display(href)
    }
  }

  // EPUB 翻页
  const epubPrev = () => epubRendition?.prev()
  const epubNext = () => epubRendition?.next()

  // TXT 上下章
  const prevChapter = () => {
    if (currentChapter > 0) goToChapter(currentChapter - 1)
  }
  const nextChapter = () => {
    if (currentChapter < chapters.length - 1) goToChapter(currentChapter + 1)
  }

  const currentTheme = themes[theme]

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: currentTheme.bg }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3, minHeight: '100vh', bgcolor: currentTheme.bg }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: currentTheme.text }}>
          <ArrowBack />
        </IconButton>
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: currentTheme.bg, color: currentTheme.text }}>
      {/* 顶部栏 */}
      <AppBar position="fixed" sx={{ bgcolor: 'rgba(0,0,0,0.8)' }}>
        <Toolbar>
        <IconButton edge="start" color="inherit" onClick={() => {
          // 退出前保存进度
          if (progress > 0 && id) {
            saveProgress()
          }
          navigate(-1)
        }}>
          <ArrowBack />
        </IconButton>
          <Typography variant="subtitle1" noWrap sx={{ flex: 1, ml: 1 }}>
            {bookInfo?.title}
          </Typography>
          <IconButton color="inherit" onClick={() => setTocOpen(true)}>
            <Menu />
          </IconButton>
          <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* 内容区域 */}
      {isEpub ? (
        /* EPUB 阅读器 */
        <Box
          ref={epubViewerRef}
          sx={{
            pt: 8,
            pb: 10,
            height: '100vh',
            width: '100%',
          }}
        />
      ) : (
        /* TXT 阅读器 */
        <Box
          ref={contentRef}
          onScroll={handleScroll}
          sx={{
            pt: 8,
            pb: 10,
            px: { xs: 2, sm: 4, md: 8, lg: 16 },
            maxWidth: 900,
            mx: 'auto',
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: fontSize,
              lineHeight: lineHeight,
              fontFamily: '"Noto Serif SC", "Source Han Serif CN", serif',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {chapters.map((chapter, index) => (
              <Box key={index} id={`chapter-${index}`} sx={{ mb: 4 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 'bold',
                    mb: 2,
                    mt: index > 0 ? 4 : 0,
                    color: currentTheme.text,
                  }}
                >
                  {chapter.title}
                </Typography>
                {content.slice(chapter.startIndex, chapter.endIndex)
                  .replace(chapter.title, '')
                  .trim()}
              </Box>
            ))}
          </Typography>
        </Box>
      )}

      {/* 底部进度 */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: 'rgba(0,0,0,0.8)',
          color: 'white',
          py: 1,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <IconButton
          size="small"
          onClick={isEpub ? epubPrev : prevChapter}
          disabled={!isEpub && currentChapter === 0}
          sx={{ color: 'white' }}
        >
          <ChevronLeft />
        </IconButton>
        <Typography variant="caption" sx={{ minWidth: 60 }}>
          {isEpub ? 'EPUB' : chapters[currentChapter]?.title?.slice(0, 15)}
        </Typography>
        <Slider
          value={progress * 100}
          onChange={(_, value) => {
            if (!isEpub && contentRef.current) {
              const scrollHeight = contentRef.current.scrollHeight - contentRef.current.clientHeight
              contentRef.current.scrollTop = scrollHeight * ((value as number) / 100)
            }
          }}
          sx={{ flex: 1 }}
          size="small"
          disabled={isEpub}
        />
        <Typography variant="caption" sx={{ minWidth: 40 }}>
          {Math.round(progress * 100)}%
        </Typography>
        <IconButton
          size="small"
          onClick={isEpub ? epubNext : nextChapter}
          disabled={!isEpub && currentChapter >= chapters.length - 1}
          sx={{ color: 'white' }}
        >
          <ChevronRight />
        </IconButton>
      </Box>

      {/* 目录抽屉 */}
      <Drawer anchor="left" open={tocOpen} onClose={() => setTocOpen(false)}>
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>目录</Typography>
          <List>
            {isEpub ? (
              epubToc.map((item, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemButton onClick={() => goToEpubChapter(item.href)}>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))
            ) : (
              chapters.map((chapter, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemButton
                    selected={index === currentChapter}
                    onClick={() => goToChapter(index)}
                  >
                    <ListItemText
                      primary={chapter.title}
                      primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </Box>
      </Drawer>

      {/* 设置抽屉 */}
      <Drawer anchor="right" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <Box sx={{ width: 300, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>阅读设置</Typography>
          
          <Typography variant="subtitle2" gutterBottom>
            <TextFields sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
            字体大小
          </Typography>
          <Slider
            value={fontSize}
            onChange={(_, value) => setFontSize(value as number)}
            min={12}
            max={28}
            step={1}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" gutterBottom>
            <FormatLineSpacing sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
            行间距
          </Typography>
          <Slider
            value={lineHeight}
            onChange={(_, value) => setLineHeight(value as number)}
            min={1.2}
            max={2.5}
            step={0.1}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>主题</Typography>
          <ToggleButtonGroup
            value={theme}
            exclusive
            onChange={(_, value) => value && setTheme(value)}
            fullWidth
            sx={{ mb: 2 }}
          >
            <ToggleButton value="dark" sx={{ bgcolor: themes.dark.bg, color: themes.dark.text }}>
              暗黑
            </ToggleButton>
            <ToggleButton value="sepia" sx={{ bgcolor: themes.sepia.bg, color: themes.sepia.text }}>
              护眼
            </ToggleButton>
            <ToggleButton value="light" sx={{ bgcolor: themes.light.bg, color: themes.light.text }}>
              亮色
            </ToggleButton>
            <ToggleButton value="green" sx={{ bgcolor: themes.green.bg, color: themes.green.text }}>
              绿色
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Drawer>
    </Box>
  )
}
