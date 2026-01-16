import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Slider, CircularProgress,
  Alert, AppBar, Toolbar, Divider, FormControl, Select, MenuItem,
  Grid, Chip
} from '@mui/material'
import {
  ArrowBack, Menu, Settings, TextFields, FormatLineSpacing,
  ChevronLeft, ChevronRight, Fullscreen, FullscreenExit,
  PlayArrow, Stop, Timer, SpaceBar
} from '@mui/icons-material'
import ePub, { Book, Rendition } from 'epubjs'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface TocChapter {
  title: string
  startOffset: number
  endOffset: number
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
  const [totalLength, setTotalLength] = useState(0)  // 全书总字符数
  const [loadedEndOffset, setLoadedEndOffset] = useState(0)  // 当前已加载内容的结束偏移
  
  // EPUB 相关
  const [epubBook, setEpubBook] = useState<Book | null>(null)
  const [epubRendition, setEpubRendition] = useState<Rendition | null>(null)
  const [epubToc, setEpubToc] = useState<EpubTocItem[]>([])
  
  // TXT 章节 - 使用后端提供的完整目录
  const [chapters, setChapters] = useState<TocChapter[]>([])
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
  
  // 进度 - 基于全书字符偏移的进度
  const [progress, setProgress] = useState(0)
  const [currentOffset, setCurrentOffset] = useState(0)  // 当前阅读位置（字符偏移）
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
          position: String(currentOffset),
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
  }, [progress, currentOffset, id])

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
    if (settingsOpen || tocOpen) return
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    
    if (x < width * 0.25) {
      if (isEpub) {
        epubPrev()
      } else {
        prevChapter()
      }
    } else if (x > width * 0.75) {
      if (isEpub) {
        epubNext()
      } else {
        nextChapter()
      }
    } else {
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

      // 加载保存的进度
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
        // 先加载完整目录
        await loadToc()
        // 再加载第一页内容
        await loadTxtContent(0)
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

  // 加载完整目录
  const loadToc = async () => {
    try {
      const tocResponse = await api.get(`/api/books/${id}/toc`)
      const data = tocResponse.data
      
      if (data.format === 'txt') {
        setChapters(data.chapters || [])
        setTotalLength(data.totalLength || 0)
        setTotalPages(data.totalPages || 1)
      }
    } catch (err) {
      console.error('加载目录失败:', err)
    }
  }

  // 加载TXT内容
  const loadTxtContent = async (page: number = 0) => {
    try {
      const contentResponse = await api.get(`/api/books/${id}/content`, {
        params: { page }
      })
      const data = contentResponse.data
      
      if (data.format === 'txt') {
        if (page === 0) {
          setContent(data.content)
        } else {
          setContent(prev => prev + data.content)
        }
        
        setCurrentPage(data.page || 0)
        setHasMore(data.hasMore || false)
        setLoadedEndOffset(data.endOffset || data.length || 0)
        
        // 如果后端没有返回totalLength，从toc获取
        if (!totalLength && data.length) {
          setTotalLength(data.length)
        }
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
      await loadTxtContent(currentPage + 1)
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
    if (contentLoaded && savedProgress !== null && !isEpub && contentRef.current && totalLength > 0) {
      // 基于全书百分比计算目标偏移
      const targetOffset = Math.floor(totalLength * savedProgress)
      setCurrentOffset(targetOffset)
      setProgress(savedProgress)
      
      // 找到对应的章节并跳转
      const chapterIndex = chapters.findIndex(ch => 
        targetOffset >= ch.startOffset && targetOffset < ch.endOffset
      )
      
      if (chapterIndex >= 0) {
        setCurrentChapter(chapterIndex)
        
        // 如果目标位置在已加载内容之外，需要加载对应页
        if (targetOffset > loadedEndOffset) {
          const targetPage = Math.floor(targetOffset / 50000)  // CHARS_PER_PAGE
          loadTxtContent(targetPage)
        }
      }
      
      console.log(`已恢复阅读进度: ${Math.round(savedProgress * 100)}%`)
    }
  }, [contentLoaded, savedProgress, isEpub, totalLength, chapters])

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
        position: String(currentOffset),
        finished: progress >= 0.98,
      })
    } catch (err) {
      console.error('保存进度失败:', err)
    }
  }

  // 基于滚动位置计算当前阅读的字符偏移
  const handleScroll = useCallback(() => {
    if (contentRef.current && !isEpub && totalLength > 0) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current
      
      // 计算滚动比例
      const scrollRatio = scrollHeight > clientHeight 
        ? scrollTop / (scrollHeight - clientHeight)
        : 0
      
      // 计算当前加载内容中的位置对应的全书偏移
      // 当前偏移 = 已加载内容开始位置 + (滚动比例 * 已加载内容长度)
      const loadedStartOffset = currentPage * 50000  // CHARS_PER_PAGE
      const loadedLength = loadedEndOffset - loadedStartOffset
      const positionInLoaded = scrollRatio * loadedLength
      const globalOffset = Math.floor(loadedStartOffset + positionInLoaded)
      
      setCurrentOffset(globalOffset)
      
      // 基于全书长度计算进度百分比
      const newProgress = totalLength > 0 ? globalOffset / totalLength : 0
      setProgress(Math.min(Math.max(newProgress, 0), 1))

      // 更新当前章节
      const chapterIndex = chapters.findIndex(ch => 
        globalOffset >= ch.startOffset && globalOffset < ch.endOffset
      )
      if (chapterIndex >= 0 && chapterIndex !== currentChapter) {
        setCurrentChapter(chapterIndex)
      }
      
      // 滚动到底部时自动加载更多
      if (hasMore && !loadingMore && scrollTop + clientHeight >= scrollHeight - 500) {
        loadMoreContent()
      }
    }
  }, [chapters, isEpub, hasMore, loadingMore, totalLength, currentPage, loadedEndOffset, currentChapter])

  const goToChapter = (index: number) => {
    setCurrentChapter(index)
    setTocOpen(false)
    
    const chapter = chapters[index]
    if (!chapter) return
    
    // 更新当前偏移和进度
    setCurrentOffset(chapter.startOffset)
    setProgress(totalLength > 0 ? chapter.startOffset / totalLength : 0)
    
    // 如果章节在已加载内容范围内，直接滚动
    const loadedStartOffset = currentPage * 50000
    if (chapter.startOffset >= loadedStartOffset && chapter.startOffset < loadedEndOffset) {
      // 在已加载内容中找到章节位置
      const chapterElement = document.getElementById(`chapter-${index}`)
      if (chapterElement) {
        chapterElement.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    
    // 需要加载对应页
    const targetPage = Math.floor(chapter.startOffset / 50000)
    if (targetPage !== currentPage) {
      // 重新加载从目标页开始的内容
      setContent('')
      loadTxtContent(targetPage)
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

  // 根据已加载内容和章节信息渲染内容
  const renderContent = () => {
    if (!content) return null
    
    const loadedStartOffset = currentPage * 50000
    
    // 找到当前已加载内容覆盖的章节
    const visibleChapters = chapters.filter(ch => {
      return ch.endOffset > loadedStartOffset && ch.startOffset < loadedEndOffset
    })
    
    if (visibleChapters.length === 0) {
      // 没有匹配章节，直接显示内容
      return (
        <Box sx={{ mb: 4 }}>
          {content}
        </Box>
      )
    }
    
    return visibleChapters.map((chapter, idx) => {
      // 计算该章节在已加载内容中的范围
      const chapterStartInContent = Math.max(0, chapter.startOffset - loadedStartOffset)
      const chapterEndInContent = Math.min(content.length, chapter.endOffset - loadedStartOffset)
      
      if (chapterStartInContent >= content.length || chapterEndInContent <= 0) {
        return null
      }
      
      const chapterContent = content.slice(chapterStartInContent, chapterEndInContent)
      const chapterIndex = chapters.indexOf(chapter)
      
      return (
        <Box key={chapter.startOffset} id={`chapter-${chapterIndex}`} sx={{ mb: 4 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 'bold',
              mb: 2,
              mt: idx > 0 ? 4 : 0,
              color: themes[theme].text,
              fontFamily: fontFamily,
            }}
          >
            {chapter.title}
          </Typography>
          {chapterContent.replace(chapter.title, '').trim()}
        </Box>
      )
    })
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
          
          <Chip 
            icon={<Timer sx={{ fontSize: 16 }} />} 
            label={formatReadingTime()} 
            size="small" 
            sx={{ mr: 1, color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }}
          />
          
          {!isEpub && (
            <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setAutoScroll(!autoScroll) }}>
              {autoScroll ? <Stop /> : <PlayArrow />}
            </IconButton>
          )}
          
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
            {renderContent()}
            {loadingMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )}
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
        <Typography variant="caption" sx={{ minWidth: 60, fontSize: 11 }}>
          {isEpub ? 'EPUB' : `第${currentChapter + 1}章`}
        </Typography>
        <Slider
          value={progress * 100}
          onChange={(_, value) => {
            // 拖动进度条跳转
            const newProgress = (value as number) / 100
            const targetOffset = Math.floor(totalLength * newProgress)
            setProgress(newProgress)
            setCurrentOffset(targetOffset)
            
            // 找到对应章节
            const chapterIndex = chapters.findIndex(ch => 
              targetOffset >= ch.startOffset && targetOffset < ch.endOffset
            )
            if (chapterIndex >= 0) {
              goToChapter(chapterIndex)
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

      {/* 目录抽屉 - 显示完整目录 */}
      <Drawer anchor="left" open={tocOpen} onClose={() => setTocOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            目录 ({chapters.length}章)
          </Typography>
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

      {/* 设置抽屉 */}
      <Drawer anchor="right" open={settingsOpen} onClose={() => setSettingsOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 320, p: 3, maxHeight: '100vh', overflow: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 3 }}>阅读设置</Typography>
          
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

          <Typography variant="subtitle2" gutterBottom>主题</Typography>
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
            {totalLength > 0 && (
              <Typography variant="body2">
                📝 全书：{Math.round(totalLength / 1000)}k字
              </Typography>
            )}
          </Box>
        </Box>
      </Drawer>
    </Box>
  )
}
