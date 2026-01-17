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

interface LoadedChapter {
  index: number
  title: string
  content: string
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
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  
  // 状态
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bookInfo, setBookInfo] = useState<{ title: string; format: string } | null>(null)
  const [isEpub, setIsEpub] = useState(false)
  
  // 章节加载状态（新逻辑）
  const [chapters, setChapters] = useState<TocChapter[]>([])  // 完整目录
  const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([])  // 已加载的章节内容
  const [loadedRange, setLoadedRange] = useState<{start: number, end: number}>({start: -1, end: -1})
  const [currentChapter, setCurrentChapter] = useState(0)
  const [totalChapters, setTotalChapters] = useState(0)
  const [totalLength, setTotalLength] = useState(0)
  const [loadingChapter, setLoadingChapter] = useState(false)
  const [pendingJump, setPendingJump] = useState<number | null>(null)  // 待跳转的章节索引
  
  // EPUB 相关
  const [epubBook, setEpubBook] = useState<Book | null>(null)
  const [epubRendition, setEpubRendition] = useState<Rendition | null>(null)
  const [epubToc, setEpubToc] = useState<EpubTocItem[]>([])
  
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
  
  // 进度 - 基于章节号+章节内偏移
  const [progress, setProgress] = useState(0)
  const [savedChapterIndex, setSavedChapterIndex] = useState<number | null>(null)
  const [savedChapterOffset, setSavedChapterOffset] = useState<number>(0)
  const pendingScrollOffsetRef = useRef<number>(0)  // 待恢复的滚动偏移

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
      if (currentChapter >= 0 && id && !isEpub) {
        saveProgress()
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [currentChapter, progress])

  // 页面卸载时保存进度
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentChapter >= 0 && id && !isEpub) {
        // 使用章节号作为位置信息
        const data = JSON.stringify({
          progress: progress,
          position: `${currentChapter}:0`,  // 章节号:章节内偏移
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
  }, [progress, currentChapter, id, isEpub])

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
      let initialChapterIndex = 0
      let initialChapterOffset = 0
      try {
        const progressResponse = await api.get<ReadingProgress>(`/api/progress/${id}`)
        if (progressResponse.data.progress > 0) {
          setProgress(progressResponse.data.progress)
          // 解析位置信息（格式：章节号:章节内偏移）
          if (progressResponse.data.position) {
            const parts = progressResponse.data.position.split(':')
            if (parts.length >= 1) {
              initialChapterIndex = parseInt(parts[0]) || 0
              initialChapterOffset = parseInt(parts[1]) || 0
            }
          }
          setSavedChapterIndex(initialChapterIndex)
          setSavedChapterOffset(initialChapterOffset)
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
        // 保存待恢复的偏移
        pendingScrollOffsetRef.current = initialChapterOffset
        // 先加载完整目录
        await loadToc()
        // 然后加载初始章节
        await loadChapterContent(initialChapterIndex)
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
        setTotalChapters(data.chapters?.length || 0)
      }
    } catch (err) {
      console.error('加载目录失败:', err)
    }
  }

  // 当 pendingJump 变化且 loadedChapters 加载完成后执行跳转
  useEffect(() => {
    if (pendingJump !== null && loadedChapters.length > 0 && !loadingChapter) {
      // 确保目标章节在已加载范围内
      if (pendingJump >= loadedRange.start && pendingJump <= loadedRange.end) {
        // 使用 setTimeout 确保 DOM 完全渲染后再滚动
        const timer = setTimeout(() => {
          // 再次检查引用是否已建立
          const targetEl = chapterRefs.current.get(pendingJump)
          if (targetEl && contentRef.current) {
            targetEl.scrollIntoView({ behavior: 'auto', block: 'start' })
            setCurrentChapter(pendingJump)
            
            // 如果有待恢复的偏移量
            const offsetToApply = pendingScrollOffsetRef.current
            if (offsetToApply > 0) {
              setTimeout(() => {
                if (contentRef.current) {
                  contentRef.current.scrollTop += offsetToApply
                }
                pendingScrollOffsetRef.current = 0
              }, 50)
            }
          } else {
            console.warn('章节元素未找到，延迟重试:', pendingJump)
            // 如果元素还没准备好，再等待一下
            setTimeout(() => {
              const retryEl = chapterRefs.current.get(pendingJump)
              if (retryEl && contentRef.current) {
                retryEl.scrollIntoView({ behavior: 'auto', block: 'start' })
                setCurrentChapter(pendingJump)
              }
            }, 100)
          }
          setPendingJump(null)
        }, 50)  // 给 React 足够时间完成渲染
        
        return () => clearTimeout(timer)
      }
    }
  }, [pendingJump, loadedChapters, loadingChapter, loadedRange])

  // 加载章节内容（核心函数）
  const loadChapterContent = async (chapterIndex: number, buffer: number = 2) => {
    if (loadingChapter) return
    
    // 检查是否已加载且目标章节在范围内
    if (loadedChapters.length > 0 && chapterIndex >= loadedRange.start && chapterIndex <= loadedRange.end) {
      // 已加载，直接滚动（不需要重新加载）
      scrollToChapter(chapterIndex)
      return
    }
    
    try {
      setLoadingChapter(true)
      // 清空旧的章节引用，避免引用混乱
      chapterRefs.current.clear()
      
      const response = await api.get(`/api/books/${id}/chapter/${chapterIndex}`, {
        params: { buffer }
      })
      
      const data = response.data
      
      if (data.format === 'txt') {
        // 先更新状态
        setLoadedChapters(data.chapters)
        setLoadedRange({
          start: data.loadedRange.start,
          end: data.loadedRange.end
        })
        setTotalChapters(data.totalChapters)
        setTotalLength(data.totalLength)
        setCurrentChapter(chapterIndex)
        
        // 计算进度
        const chapter = data.chapters[data.currentIndex]
        if (chapter && data.totalLength > 0) {
          setProgress(chapter.startOffset / data.totalLength)
        }
        
        // 设置待跳转章节，让 useEffect 在渲染后执行跳转
        setPendingJump(chapterIndex)
      }
    } catch (err) {
      console.error('加载章节内容失败:', err)
      setError('加载章节失败')
    } finally {
      setLoadingChapter(false)
    }
  }

  // 滚动到指定章节（支持恢复偏移）
  const scrollToChapter = (chapterIndex: number, scrollOffset?: number) => {
    const element = chapterRefs.current.get(chapterIndex)
    if (element && contentRef.current) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' })
      setCurrentChapter(chapterIndex)
      
      // 如果有待恢复的偏移量，在章节定位后应用
      const offsetToApply = scrollOffset ?? pendingScrollOffsetRef.current
      if (offsetToApply > 0) {
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop += offsetToApply
          }
          // 清空待恢复的偏移
          pendingScrollOffsetRef.current = 0
        }, 50)
      }
    }
  }

  // 加载更多章节（向前或向后）
  const loadMoreChapters = async (direction: 'prev' | 'next') => {
    if (loadingChapter) return
    
    let targetIndex: number
    if (direction === 'prev') {
      targetIndex = Math.max(0, loadedRange.start - 1)
      if (targetIndex === loadedRange.start) return // 已经是第一章
    } else {
      targetIndex = Math.min(totalChapters - 1, loadedRange.end + 1)
      if (targetIndex === loadedRange.end) return // 已经是最后一章
    }
    
    try {
      setLoadingChapter(true)
      
      // 记录当前滚动位置（用于向前加载时保持位置）
      const scrollBefore = contentRef.current?.scrollTop || 0
      const scrollHeightBefore = contentRef.current?.scrollHeight || 0
      
      const response = await api.get(`/api/books/${id}/chapter/${targetIndex}`, {
        params: { buffer: 1 }
      })
      
      const data = response.data
      
      if (data.format === 'txt') {
        // 合并章节
        if (direction === 'prev') {
          // 向前加载，把新章节放到开头
          const newChapters = data.chapters.filter((ch: LoadedChapter) => ch.index < loadedRange.start)
          if (newChapters.length > 0) {
            setLoadedChapters(prev => [...newChapters, ...prev])
            setLoadedRange(prev => ({
              start: data.loadedRange.start,
              end: prev.end
            }))
            
            // 在下一帧调整滚动位置，保持当前阅读位置不变
            requestAnimationFrame(() => {
              if (contentRef.current) {
                const scrollHeightAfter = contentRef.current.scrollHeight
                const heightDiff = scrollHeightAfter - scrollHeightBefore
                contentRef.current.scrollTop = scrollBefore + heightDiff
              }
            })
          }
        } else {
          // 向后加载，把新章节放到末尾
          const newChapters = data.chapters.filter((ch: LoadedChapter) => ch.index > loadedRange.end)
          if (newChapters.length > 0) {
            setLoadedChapters(prev => [...prev, ...newChapters])
            setLoadedRange(prev => ({
              start: prev.start,
              end: data.loadedRange.end
            }))
          }
        }
      }
    } catch (err) {
      console.error('加载更多章节失败:', err)
    } finally {
      setLoadingChapter(false)
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

  const saveProgress = async () => {
    try {
      // 计算当前章节内的滚动偏移
      let scrollOffset = 0
      if (contentRef.current) {
        const chapterEl = chapterRefs.current.get(currentChapter)
        if (chapterEl) {
          const containerRect = contentRef.current.getBoundingClientRect()
          const chapterRect = chapterEl.getBoundingClientRect()
          // 容器顶部减去章节顶部 = 章节已经滚过的距离
          scrollOffset = Math.max(0, containerRect.top - chapterRect.top)
        }
      }
      
      await api.post(`/api/progress/${id}`, {
        progress: progress,
        position: `${currentChapter}:${Math.round(scrollOffset)}`,  // 章节号:章节内滚动偏移
        finished: progress >= 0.98,
      })
    } catch (err) {
      console.error('保存进度失败:', err)
    }
  }

  // 监听滚动，更新当前章节并预加载
  const handleScroll = useCallback(() => {
    if (!contentRef.current || isEpub || loadedChapters.length === 0) return
    
    const container = contentRef.current
    const containerRect = container.getBoundingClientRect()
    const containerTop = containerRect.top
    
    // 找到当前可见的章节
    let visibleChapterIndex = currentChapter
    for (const [index, element] of chapterRefs.current.entries()) {
      const rect = element.getBoundingClientRect()
      // 章节顶部进入视口中间位置时认为是当前章节
      if (rect.top <= containerTop + containerRect.height / 3) {
        visibleChapterIndex = index
      }
    }
    
    if (visibleChapterIndex !== currentChapter) {
      setCurrentChapter(visibleChapterIndex)
      
      // 更新进度
      const chapter = loadedChapters.find(ch => ch.index === visibleChapterIndex)
      if (chapter && totalLength > 0) {
        setProgress(chapter.startOffset / totalLength)
      }
    }
    
    // 接近边界时预加载更多章节
    const scrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    
    // 接近顶部，加载前面的章节
    if (scrollTop < 500 && loadedRange.start > 0) {
      loadMoreChapters('prev')
    }
    
    // 接近底部，加载后面的章节
    if (scrollTop + clientHeight > scrollHeight - 500 && loadedRange.end < totalChapters - 1) {
      loadMoreChapters('next')
    }
  }, [currentChapter, isEpub, loadedChapters, loadedRange, totalChapters, totalLength])

  const goToChapter = (index: number) => {
    setTocOpen(false)
    
    // 如果章节在已加载范围内，直接滚动
    if (index >= loadedRange.start && index <= loadedRange.end) {
      scrollToChapter(index)
    } else {
      // 需要重新加载
      loadChapterContent(index)
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
    if (currentChapter > 0) {
      goToChapter(currentChapter - 1)
    }
  }
  
  const nextChapter = () => {
    if (currentChapter < totalChapters - 1) {
      goToChapter(currentChapter + 1)
    }
  }

  // 渲染已加载的章节
  const renderChapters = () => {
    if (loadedChapters.length === 0) return null
    
    return loadedChapters.map((chapter) => (
      <Box
        key={chapter.index}
        ref={(el: HTMLDivElement | null) => {
          if (el) {
            chapterRefs.current.set(chapter.index, el)
          }
        }}
        id={`chapter-${chapter.index}`}
        sx={{ mb: 4 }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 'bold',
            mb: 2,
            mt: chapter.index > loadedRange.start ? 4 : 0,
            color: themes[theme].text,
            fontFamily: fontFamily,
          }}
        >
          {chapter.title}
        </Typography>
        <Typography
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {chapter.content}
        </Typography>
      </Box>
    ))
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
            if (currentChapter >= 0 && id && !isEpub) {
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
          {/* 加载前面章节指示 */}
          {loadingChapter && loadedRange.start > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          
          <Typography
            component="div"
            sx={{
              fontSize: fontSize,
              lineHeight: lineHeight,
              fontFamily: fontFamily,
              letterSpacing: `${letterSpacing}px`,
              '& p, & div': {
                marginBottom: `${paragraphSpacing}em`,
              }
            }}
          >
            {renderChapters()}
          </Typography>
          
          {/* 加载后面章节指示 */}
          {loadingChapter && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
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
        <Typography variant="caption" sx={{ minWidth: 80, fontSize: 11 }}>
          {isEpub ? 'EPUB' : `${currentChapter + 1}/${totalChapters}章`}
        </Typography>
        <Slider
          value={progress * 100}
          onChange={(_, value) => {
            if (isEpub) return
            // 拖动进度条跳转
            const newProgress = (value as number) / 100
            const targetChapter = Math.floor(newProgress * totalChapters)
            goToChapter(Math.min(targetChapter, totalChapters - 1))
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
          disabled={!isEpub && currentChapter >= totalChapters - 1}
          sx={{ color: 'white' }}
        >
          <ChevronRight />
        </IconButton>
      </Box>

      {/* 目录抽屉 - 显示完整目录 */}
      <Drawer anchor="left" open={tocOpen} onClose={() => setTocOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            目录 ({totalChapters}章)
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
              📚 章节：{currentChapter + 1} / {totalChapters}
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
