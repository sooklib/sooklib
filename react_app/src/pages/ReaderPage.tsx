import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Slider, ToggleButtonGroup, ToggleButton, CircularProgress,
  Alert, AppBar, Toolbar, Divider, FormControl, Select, MenuItem, Switch,
  FormControlLabel, Grid, Chip
} from '@mui/material'
import {
  ArrowBack, Menu, Settings, TextFields, FormatLineSpacing,
  ChevronLeft, ChevronRight, Fullscreen, FullscreenExit,
  PlayArrow, Stop, Timer, SpaceBar
} from '@mui/icons-material'
import ePub, { Book, Rendition } from 'epubjs'
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

interface FontInfo {
  id: string
  name: string
  family: string
  is_builtin: boolean
  file_url?: string
}

// 主题预设 (静读天下风格 - 8种主题)
const themes = {
  dark: { bg: '#1a1a1a', text: '#e0e0e0', name: '暗黑' },
  sepia: { bg: '#f4ecd8', text: '#5b4636', name: '羊皮纸' },
  light: { bg: '#ffffff', text: '#333333', name: '亮色' },
  green: { bg: '#c7edcc', text: '#2d4a32', name: '护眼绿' },
  night: { bg: '#0d1117', text: '#8b949e', name: '深夜' },
  cream: { bg: '#faf8f5', text: '#4a4a4a', name: '奶油' },
  blue: { bg: '#1e2a38', text: '#9eb1c8', name: '深蓝' },
  pink: { bg: '#fff5f5', text: '#5c4444', name: '粉嫩' },
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
  
  // 分页加载状态
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalLength, setTotalLength] = useState(0)
  
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
  const [fontFamily, setFontFamily] = useState('"Noto Serif SC", "Source Han Serif CN", serif')
  const [fonts, setFonts] = useState<FontInfo[]>([])
  const [selectedFontId, setSelectedFontId] = useState('noto-serif')
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [paragraphSpacing, setParagraphSpacing] = useState(1.5)
  
  // 高级功能 (静读天下风格)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(30)
  const autoScrollRef = useRef<number | null>(null)
  const [showToolbar, setShowToolbar] = useState(true)
  const [readingStartTime] = useState(Date.now())
  const [readingTime, setReadingTime] = useState(0)
  
  // 抽屉
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  // 进度
  const [progress, setProgress] = useState(0)
  const [savedProgress, setSavedProgress] = useState<number | null>(null)
  const [contentLoaded, setContentLoaded] = useState(false)

  // 阅读计时器
  useEffect(() => {
    const timer = setInterval(() => {
      setReadingTime(Math.floor((Date.now() - readingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [readingStartTime])

  // 加载书籍信息
  useEffect(() => {
    if (id) {
      loadBook()
    }
    return () => {
      if (epubBook) {
        epubBook.destroy()
      }
    }
  }, [id])

  // 保存进度（防抖）
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

  // 加载字体列表
  useEffect(() => {
    const loadFonts = async () => {
      try {
        const response = await api.get<{ fonts: FontInfo[] }>('/api/fonts')
        setFonts(response.data.fonts)
      } catch (err) {
        console.error('加载字体列表失败:', err)
      }
    }
    loadFonts()
  }, [])

  // 加载保存的设置
  useEffect(() => {
    const savedSettings = localStorage.getItem('reader_settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.fontSize) setFontSize(settings.fontSize)
        if (settings.lineHeight) setLineHeight(settings.lineHeight)
        if (settings.theme) setTheme(settings.theme)
        if (settings.selectedFontId) setSelectedFontId(settings.selectedFontId)
        if (settings.fontFamily) setFontFamily(settings.fontFamily)
        if (settings.letterSpacing !== undefined) setLetterSpacing(settings.letterSpacing)
        if (settings.paragraphSpacing !== undefined) setParagraphSpacing(settings.paragraphSpacing)
        if (settings.autoScrollSpeed) setAutoScrollSpeed(settings.autoScrollSpeed)
      } catch (e) {
        console.error('加载阅读设置失败:', e)
      }
    }
  }, [])

  // 保存设置
  useEffect(() => {
    localStorage.setItem('reader_settings', JSON.stringify({ 
      fontSize, lineHeight, theme, selectedFontId, fontFamily,
      letterSpacing, paragraphSpacing, autoScrollSpeed
    }))
  }, [fontSize, lineHeight, theme, selectedFontId, fontFamily, letterSpacing, paragraphSpacing, autoScrollSpeed])

  // 自动滚动功能
  useEffect(() => {
    if (autoScroll && contentRef.current && !isEpub) {
      autoScrollRef.current = window.setInterval(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop += autoScrollSpeed / 60
          if (contentRef.current.scrollTop >= contentRef.current.scrollHeight - contentRef.current.clientHeight) {
            setAutoScroll(false)
          }
        }
      }, 1000 / 60)
    } else {
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
        autoScrollRef.current = null
      }
    }
    return () => {
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
      }
    }
  }, [autoScroll, autoScrollSpeed, isEpub])

  // 全屏切换
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 点击区域翻页（静读天下风格）
  const handleContentClick = (e: React.MouseEvent) => {
    // 不处理设置抽屉打开时的点击
    if (settingsOpen || tocOpen) return
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    
    // 点击左侧1/4区域
    if (x < width * 0.25) {
      if (isEpub) {
        epubPrev()
      } else {
        prevChapter()
      }
    }
    // 点击右侧1/4区域
    else if (x > width * 0.75) {
      if (isEpub) {
        epubNext()
      } else {
        nextChapter()
      }
    }
    // 点击中间区域
    else {
      setShowToolbar(!showToolbar)
    }
  }

  // 格式化阅读时长
  const formatReadingTime = () => {
    const hours = Math.floor(readingTime / 3600)
    const minutes = Math.floor((readingTime % 3600) / 60)
    const seconds = readingTime % 60
    if (hours > 0) {
      return `${hours}时${minutes}分`
    }
    return `${minutes}分${seconds}秒`
  }

  // 切换字体
  const handleFontChange = (fontId: string) => {
    const font = fonts.find(f => f.id === fontId)
    if (font) {
      setSelectedFontId(fontId)
      setFontFamily(font.family)
    }
  }

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
          'letter-spacing': `${letterSpacing}px`,
        }
      })
    }
  }, [epubRendition, fontSize, lineHeight, theme, letterSpacing])

  const loadBook = async () => {
    try {
      setLoading(true)
      setError('')

      try {
        const progressResponse = await api.get<ReadingProgress>(`/api/progress/${id}`)
        if (progressResponse.data.progress > 0) {
          setSavedProgress(progressResponse.data.progress)
        }
      } catch {
        console.log('无保存的阅读进度')
      }

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

  const loadTxt = async (page: number = 0) => {
    try {
      const contentResponse = await api.get(`/api/books/${id}/content`, {
        params: { page }
      })
      const data = contentResponse.data
      
      if (data.format === 'txt') {
        if (page === 0) {
          // 第一页，直接设置内容
          setContent(data.content)
          const parsedChapters = parseChapters(data.content)
          setChapters(parsedChapters)
        } else {
          // 后续页，追加内容
          setContent(prev => prev + data.content)
          // 重新解析章节（包含所有已加载内容）
          const newContent = content + data.content
          const parsedChapters = parseChapters(newContent)
          setChapters(parsedChapters)
        }
        
        // 更新分页状态
        setCurrentPage(data.page || 0)
        setTotalPages(data.totalPages || 1)
        setHasMore(data.hasMore || false)
        setTotalLength(data.length || 0)
      }
    } catch (err) {
      console.error('加载TXT内容失败:', err)
      throw err
    }
  }

  // 加载更多内容
  const loadMoreContent = async () => {
    if (!hasMore || loadingMore) return
    
    try {
      setLoadingMore(true)
      await loadTxt(currentPage + 1)
    } catch (err) {
      console.error('加载更多内容失败:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const loadEpub = async () => {
    try {
      const epubUrl = `/api/books/${id}/content`
      
      const book = ePub(epubUrl, {
        requestHeaders: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      setEpubBook(book)
      
      await book.ready
      
      const navigation = await book.loaded.navigation
      if (navigation.toc) {
        setEpubToc(navigation.toc as EpubTocItem[])
      }
      
      if (epubViewerRef.current) {
        const rendition = book.renderTo(epubViewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none'
        })
        
        setEpubRendition(rendition)
        
        const currentTheme = themes[theme]
        rendition.themes.default({
          body: {
            background: currentTheme.bg,
            color: currentTheme.text,
            'font-size': `${fontSize}px`,
            'line-height': `${lineHeight}`,
          }
        })
        
        await rendition.display()
        
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
      
      // 滚动到底部时自动加载更多
      if (hasMore && !loadingMore && scrollTop + clientHeight >= scrollHeight - 500) {
        loadMoreContent()
      }
    }
  }, [chapters, isEpub, hasMore, loadingMore])

  const goToChapter = (index: number) => {
    setCurrentChapter(index)
    setTocOpen(false)
    const chapterElement = document.getElementById(`chapter-${index}`)
    if (chapterElement) {
      chapterElement.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const goToEpubChapter = (href: string) => {
    setTocOpen(false)
    if (epubRendition) {
      epubRendition.display(href)
    }
  }

  const epubPrev = () => epubRendition?.prev()
  const epubNext = () => epubRendition?.next()

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
    <Box 
      sx={{ minHeight: '100vh', bgcolor: currentTheme.bg, color: currentTheme.text }}
      onClick={handleContentClick}
    >
      {/* 顶部栏 */}
      <AppBar 
        position="fixed" 
        sx={{ 
          bgcolor: 'rgba(0,0,0,0.8)',
          transform: showToolbar ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 0.3s ease'
        }}
      >
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={(e) => {
            e.stopPropagation()
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
          
          {/* 阅读时长 */}
          <Chip 
            icon={<Timer sx={{ fontSize: 16 }} />} 
            label={formatReadingTime()} 
            size="small" 
            sx={{ mr: 1, color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }}
          />
          
          {/* 自动滚动 */}
          {!isEpub && (
            <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setAutoScroll(!autoScroll) }}>
              {autoScroll ? <Stop /> : <PlayArrow />}
            </IconButton>
          )}
          
          {/* 全屏 */}
          <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}>
            {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          </IconButton>
          
          <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setTocOpen(true) }}>
            <Menu />
          </IconButton>
          <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setSettingsOpen(true) }}>
            <Settings />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* 内容区域 */}
      {isEpub ? (
        <Box
          ref={epubViewerRef}
          sx={{
            pt: showToolbar ? 8 : 0,
            pb: showToolbar ? 10 : 0,
            height: '100vh',
            width: '100%',
            transition: 'padding 0.3s ease',
          }}
        />
      ) : (
        <Box
          ref={contentRef}
          onScroll={handleScroll}
          sx={{
            pt: showToolbar ? 8 : 2,
            pb: showToolbar ? 10 : 2,
            px: { xs: 2, sm: 4, md: 8, lg: 16 },
            maxWidth: 900,
            mx: 'auto',
            height: '100vh',
            overflow: 'auto',
            transition: 'padding 0.3s ease',
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: fontSize,
              lineHeight: lineHeight,
              fontFamily: fontFamily,
              letterSpacing: `${letterSpacing}px`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              '& p, & div': {
                marginBottom: `${paragraphSpacing}em`,
              }
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
                    fontFamily: fontFamily,
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
          transform: showToolbar ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); isEpub ? epubPrev() : prevChapter() }}
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
          onClick={(e) => e.stopPropagation()}
          sx={{ flex: 1 }}
          size="small"
          disabled={isEpub}
        />
        <Typography variant="caption" sx={{ minWidth: 40 }}>
          {Math.round(progress * 100)}%
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); isEpub ? epubNext() : nextChapter() }}
          disabled={!isEpub && currentChapter >= chapters.length - 1}
          sx={{ color: 'white' }}
        >
          <ChevronRight />
        </IconButton>
      </Box>

      {/* 目录抽屉 */}
      <Drawer anchor="left" open={tocOpen} onClose={() => setTocOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>目录</Typography>
          <List sx={{ maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
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

      {/* 设置抽屉 (静读天下风格 - 更多选项) */}
      <Drawer anchor="right" open={settingsOpen} onClose={() => setSettingsOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 320, p: 3, maxHeight: '100vh', overflow: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 3 }}>阅读设置</Typography>
          
          {/* 字体大小 */}
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <TextFields sx={{ fontSize: 16, mr: 1 }} />
            字体大小 ({fontSize}px)
          </Typography>
          <Slider
            value={fontSize}
            onChange={(_, value) => setFontSize(value as number)}
            min={12}
            max={32}
            step={1}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          {/* 行间距 */}
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <FormatLineSpacing sx={{ fontSize: 16, mr: 1 }} />
            行间距 ({lineHeight})
          </Typography>
          <Slider
            value={lineHeight}
            onChange={(_, value) => setLineHeight(value as number)}
            min={1.2}
            max={3.0}
            step={0.1}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          {/* 字间距 */}
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <SpaceBar sx={{ fontSize: 16, mr: 1 }} />
            字间距 ({letterSpacing}px)
          </Typography>
          <Slider
            value={letterSpacing}
            onChange={(_, value) => setLetterSpacing(value as number)}
            min={-1}
            max={5}
            step={0.5}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          {/* 段落间距 */}
          <Typography variant="subtitle2" gutterBottom>
            段落间距 ({paragraphSpacing}em)
          </Typography>
          <Slider
            value={paragraphSpacing}
            onChange={(_, value) => setParagraphSpacing(value as number)}
            min={0.5}
            max={3.0}
            step={0.1}
            valueLabelDisplay="auto"
            sx={{ mb: 3 }}
          />

          <Divider sx={{ my: 2 }} />

          {/* 字体选择 */}
          <Typography variant="subtitle2" gutterBottom>字体</Typography>
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <Select
              value={selectedFontId}
              onChange={(e) => handleFontChange(e.target.value)}
            >
              {fonts.map((font) => (
                <MenuItem key={font.id} value={font.id}>
                  <Typography sx={{ fontFamily: font.family }}>
                    {font.name}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider sx={{ my: 2 }} />

          {/* 主题选择 (8种) */}
          <Typography variant="subtitle2" gutterBottom>主题 (8种)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {Object.entries(themes).map(([key, value]) => (
              <Grid item xs={3} key={key}>
                <Box
                  onClick={() => setTheme(key as keyof typeof themes)}
                  sx={{
                    width: '100%',
                    aspectRatio: '1',
                    bgcolor: value.bg,
                    border: theme === key ? '3px solid #1976d2' : '1px solid #ccc',
                    borderRadius: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    '&:hover': { transform: 'scale(1.05)' }
                  }}
                >
                  <Typography sx={{ color: value.text, fontSize: 10 }}>
                    {value.name}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* 自动滚动速度 */}
          {!isEpub && (
            <>
              <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <PlayArrow sx={{ fontSize: 16, mr: 1 }} />
                自动滚动速度 ({autoScrollSpeed} 像素/秒)
              </Typography>
              <Slider
                value={autoScrollSpeed}
                onChange={(_, value) => setAutoScrollSpeed(value as number)}
                min={10}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                sx={{ mb: 2 }}
              />
            </>
          )}

          {/* 阅读统计 */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>阅读统计</Typography>
          <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}>
            <Typography variant="body2">
              📖 当前进度：{Math.round(progress * 100)}%
            </Typography>
            <Typography variant="body2">
              ⏱️ 本次阅读：{formatReadingTime()}
            </Typography>
            <Typography variant="body2">
              📚 章节：{currentChapter + 1} / {chapters.length}
            </Typography>
          </Box>
        </Box>
      </Drawer>
    </Box>
  )
}
