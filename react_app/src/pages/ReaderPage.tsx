import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Slider, CircularProgress,
  Alert, AppBar, Toolbar, Divider, FormControl, Select, MenuItem,
  Grid, Chip, TextField, InputAdornment, Paper
} from '@mui/material'
import {
  ArrowBack, Menu, Settings, TextFields, FormatLineSpacing,
  ChevronLeft, ChevronRight, Fullscreen, FullscreenExit,
  PlayArrow, Stop, Timer, SpaceBar, Bookmark, BookmarkBorder,
  Delete, Add, Search, Close, Edit, FormatColorFill, Download
} from '@mui/icons-material'
import ePub, { Book, Rendition } from 'epubjs'
import api, { readingStatsApi } from '../services/api'
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

interface BookmarkInfo {
  id: number
  book_id: number
  book_title: string
  position: string
  chapter_title: string | null
  note: string | null
  created_at: string
  updated_at: string
}

interface SearchMatch {
  chapterIndex: number
  chapterTitle: string
  position: number
  positionInChapter: number
  context: string
  highlightStart: number
  highlightEnd: number
}

interface SearchResult {
  keyword: string
  matches: SearchMatch[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface AnnotationInfo {
  id: number
  user_id: number
  book_id: number
  chapter_index: number
  chapter_title: string | null
  start_offset: number
  end_offset: number
  selected_text: string
  note: string | null
  annotation_type: 'highlight' | 'note' | 'underline'
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple'
  created_at: string
  updated_at: string
}

// 高亮颜色配置 (增加透明度以适应深色模式)
const highlightColors = {
  yellow: { bg: 'rgba(255, 235, 59, 0.5)', name: '黄色' },
  green: { bg: 'rgba(76, 175, 80, 0.5)', name: '绿色' },
  blue: { bg: 'rgba(33, 150, 243, 0.5)', name: '蓝色' },
  red: { bg: 'rgba(244, 67, 54, 0.5)', name: '红色' },
  purple: { bg: 'rgba(156, 39, 176, 0.5)', name: '紫色' },
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
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  
  // 书签
  const [bookmarks, setBookmarks] = useState<BookmarkInfo[]>([])
  const [loadingBookmarks, setLoadingBookmarks] = useState(false)
  
  // 搜索
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchPage, setSearchPage] = useState(0)
  
  // 批注/高亮
  const [annotations, setAnnotations] = useState<AnnotationInfo[]>([])
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [loadingAnnotations, setLoadingAnnotations] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [selectionInfo, setSelectionInfo] = useState<{
    chapterIndex: number
    startOffset: number
    endOffset: number
    rect: DOMRect | null
  } | null>(null)
  const [showAnnotationPopup, setShowAnnotationPopup] = useState(false)
  const [annotationColor, setAnnotationColor] = useState<keyof typeof highlightColors>('yellow')
  const [annotationNote, setAnnotationNote] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState<AnnotationInfo | null>(null)
  
  // 进度 - 基于章节号+章节内偏移
  const [progress, setProgress] = useState(0)
  const [savedChapterIndex, setSavedChapterIndex] = useState<number | null>(null)
  const [savedChapterOffset, setSavedChapterOffset] = useState<number>(0)
  const pendingScrollOffsetRef = useRef<number>(0)  // 待恢复的滚动偏移
  
  // 阅读统计相关 Refs
  const sessionIdRef = useRef<number | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const progressRef = useRef(progress) // 追踪最新进度
  
  // 更新 progressRef
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  // 获取当前阅读位置字符串
  const getCurrentPosition = useCallback(() => {
    if (isEpub) return null // EPUB 位置处理稍有不同
    
    let scrollOffset = 0
    if (contentRef.current) {
      const chapterEl = chapterRefs.current.get(currentChapter)
      if (chapterEl) {
        const containerRect = contentRef.current.getBoundingClientRect()
        const chapterRect = chapterEl.getBoundingClientRect()
        scrollOffset = Math.max(0, containerRect.top - chapterRect.top)
      }
    }
    return `${currentChapter}:${Math.round(scrollOffset)}`
  }, [currentChapter, isEpub])

  // 发送心跳
  const sendHeartbeat = useCallback(async () => {
    if (!sessionIdRef.current) return
    
    try {
      const duration = Math.floor((Date.now() - readingStartTime) / 1000)
      const position = getCurrentPosition()
      
      await readingStatsApi.sendHeartbeat(
        sessionIdRef.current,
        duration,
        progressRef.current,
        position || undefined
      )
    } catch (err) {
      console.error('发送心跳失败:', err)
    }
  }, [readingStartTime, getCurrentPosition])

  // 结束会话
  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) return
    
    try {
      const duration = Math.floor((Date.now() - readingStartTime) / 1000)
      const position = getCurrentPosition()
      
      // 使用 sendBeacon 确保页面关闭时也能发送
      const data = JSON.stringify({
        session_id: sessionIdRef.current,
        duration_seconds: duration,
        progress: progressRef.current,
        position: position
      })
      
      const blob = new Blob([data], { type: 'application/json' })
      navigator.sendBeacon('/api/stats/session/end', blob)
      
      sessionIdRef.current = null
    } catch (err) {
      console.error('结束会话失败:', err)
    }
  }, [readingStartTime, getCurrentPosition])

  // 管理阅读会话生命周期
  useEffect(() => {
    if (!id) return

    const startSession = async () => {
      try {
        const response = await readingStatsApi.startSession(parseInt(id))
        sessionIdRef.current = response.session_id
        
        // 启动心跳定时器 (每30秒)
        heartbeatTimerRef.current = window.setInterval(sendHeartbeat, 30000)
      } catch (err) {
        console.error('开始阅读会话失败:', err)
      }
    }

    startSession()

    // 页面可见性变化处理
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面不可见时，可以选择发送一次心跳或者暂停计时（这里简单发送心跳）
        sendHeartbeat()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      endSession()
    }
  }, [id, sendHeartbeat, endSession])

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

  // 批注功能
  const loadAnnotations = async () => {
    if (!id) return
    try {
      setLoadingAnnotations(true)
      const response = await api.get<AnnotationInfo[]>(`/api/annotations/book/${id}`)
      setAnnotations(response.data)
    } catch (err) {
      console.error('加载批注失败:', err)
    } finally {
      setLoadingAnnotations(false)
    }
  }

  // 加载章节批注
  const loadChapterAnnotations = async (chapterIndex: number) => {
    if (!id) return []
    try {
      const response = await api.get<AnnotationInfo[]>(`/api/annotations/book/${id}/chapter/${chapterIndex}`)
      return response.data
    } catch (err) {
      console.error('加载章节批注失败:', err)
      return []
    }
  }

  // 创建批注
  const createAnnotation = async () => {
    if (!id || !selectionInfo || !selectedText) return
    
    try {
      const chapterTitle = chapters[selectionInfo.chapterIndex]?.title || `第${selectionInfo.chapterIndex + 1}章`
      
      await api.post('/api/annotations', {
        book_id: parseInt(id),
        chapter_index: selectionInfo.chapterIndex,
        chapter_title: chapterTitle,
        start_offset: selectionInfo.startOffset,
        end_offset: selectionInfo.endOffset,
        selected_text: selectedText,
        note: annotationNote || null,
        annotation_type: annotationNote ? 'note' : 'highlight',
        color: annotationColor
      })
      
      // 清除选择状态
      setShowAnnotationPopup(false)
      setSelectedText('')
      setSelectionInfo(null)
      setAnnotationNote('')
      window.getSelection()?.removeAllRanges()
      
      // 重新加载批注
      await loadAnnotations()
    } catch (err) {
      console.error('创建批注失败:', err)
    }
  }

  // 更新批注
  const updateAnnotation = async (annotationId: number, data: { note?: string; color?: string }) => {
    try {
      await api.put(`/api/annotations/${annotationId}`, data)
      await loadAnnotations()
      setEditingAnnotation(null)
    } catch (err) {
      console.error('更新批注失败:', err)
    }
  }

  // 删除批注
  const deleteAnnotation = async (annotationId: number) => {
    try {
      await api.delete(`/api/annotations/${annotationId}`)
      setAnnotations(prev => prev.filter(a => a.id !== annotationId))
    } catch (err) {
      console.error('删除批注失败:', err)
    }
  }

  // 导出批注
  const exportAnnotations = async () => {
    if (!id) return
    try {
      const response = await api.get(`/api/annotations/book/${id}/export`)
      const data = response.data
      
      // 生成导出文本
      let exportText = `# ${data.book_title} - 笔记导出\n\n`
      exportText += `导出时间: ${new Date(data.exported_at).toLocaleString('zh-CN')}\n`
      exportText += `总计: ${data.total_annotations} 条批注\n\n`
      exportText += '---\n\n'
      
      let currentChapter = -1
      for (const annotation of data.annotations) {
        if (annotation.chapter_index !== currentChapter) {
          currentChapter = annotation.chapter_index
          exportText += `## ${annotation.chapter_title || `第${currentChapter + 1}章`}\n\n`
        }
        
        exportText += `> ${annotation.selected_text}\n\n`
        if (annotation.note) {
          exportText += `📝 ${annotation.note}\n\n`
        }
        exportText += `*${new Date(annotation.created_at).toLocaleString('zh-CN')}*\n\n`
        exportText += '---\n\n'
      }
      
      // 下载文件
      const blob = new Blob([exportText], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.book_title}-笔记.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出批注失败:', err)
    }
  }

  // 处理文本选择
  const handleTextSelection = useCallback(() => {
    if (isEpub) return
    
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setShowAnnotationPopup(false)
      return
    }
    
    const text = selection.toString().trim()
    if (!text) {
      setShowAnnotationPopup(false)
      return
    }
    
    // 查找选中文本所在的章节
    const range = selection.getRangeAt(0)
    const startContainer = range.startContainer
    
    // 向上查找章节容器
    let chapterEl: HTMLElement | null = null
    let node: Node | null = startContainer
    while (node) {
      if (node instanceof HTMLElement && node.id?.startsWith('chapter-')) {
        chapterEl = node
        break
      }
      node = node.parentNode
    }
    
    if (!chapterEl) {
      setShowAnnotationPopup(false)
      return
    }
    
    const chapterIndex = parseInt(chapterEl.id.replace('chapter-', ''))
    if (isNaN(chapterIndex)) {
      setShowAnnotationPopup(false)
      return
    }
    
    // 获取章节内容元素
    const chapter = loadedChapters.find(ch => ch.index === chapterIndex)
    if (!chapter) {
      setShowAnnotationPopup(false)
      return
    }
    
    // 计算在章节内容中的偏移（简化版：基于选中文本在章节中的位置）
    const chapterContent = chapter.content
    const startOffset = chapterContent.indexOf(text)
    if (startOffset === -1) {
      // 如果找不到完全匹配，使用选择范围的近似位置
      setShowAnnotationPopup(false)
      return
    }
    
    const endOffset = startOffset + text.length
    const rect = range.getBoundingClientRect()
    
    setSelectedText(text)
    setSelectionInfo({
      chapterIndex,
      startOffset,
      endOffset,
      rect
    })
    setShowAnnotationPopup(true)
  }, [isEpub, loadedChapters])

  // 监听选择变化
  useEffect(() => {
    document.addEventListener('selectionchange', handleTextSelection)
    return () => document.removeEventListener('selectionchange', handleTextSelection)
  }, [handleTextSelection])

  // 加载书籍时也加载批注
  useEffect(() => {
    if (id && !isEpub) {
      loadAnnotations()
    }
  }, [id, isEpub])

  // 跳转到批注位置
  const goToAnnotation = (annotation: AnnotationInfo) => {
    setAnnotationsOpen(false)
    
    if (annotation.chapter_index >= loadedRange.start && annotation.chapter_index <= loadedRange.end) {
      scrollToChapter(annotation.chapter_index)
    } else {
      loadChapterContent(annotation.chapter_index)
    }
  }

  // 渲染带高亮的章节内容
  const renderChapterWithHighlights = (chapter: LoadedChapter) => {
    const chapterAnnotations = annotations.filter(a => a.chapter_index === chapter.index)
    
    if (chapterAnnotations.length === 0) {
      return chapter.content
    }
    
    // 按 startOffset 排序
    const sortedAnnotations = [...chapterAnnotations].sort((a, b) => a.start_offset - b.start_offset)
    
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    
    for (const annotation of sortedAnnotations) {
      // 添加高亮前的普通文本
      if (annotation.start_offset > lastEnd) {
        parts.push(chapter.content.substring(lastEnd, annotation.start_offset))
      }
      
      // 添加高亮文本
      const highlightColor = highlightColors[annotation.color] || highlightColors.yellow
      parts.push(
        <Box
          component="span"
          key={annotation.id}
          sx={{
            bgcolor: highlightColor.bg,
            borderRadius: '2px',
            cursor: annotation.note ? 'pointer' : 'default',
            position: 'relative',
            '&:hover': annotation.note ? {
              '& .annotation-note-tooltip': {
                display: 'block'
              }
            } : {}
          }}
          title={annotation.note || undefined}
        >
          {chapter.content.substring(annotation.start_offset, annotation.end_offset)}
          {annotation.note && (
            <>
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  top: -2,
                  right: -6,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'error.main',
                  zIndex: 1,
                }}
              />
              <Box
                className="annotation-note-tooltip"
                sx={{
                  display: 'none',
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  bgcolor: 'rgba(0, 0, 0, 0.9)',
                  color: 'white',
                  p: 1,
                  borderRadius: 1,
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  mb: 1,
                  pointerEvents: 'none',
                  boxShadow: 3,
                }}
              >
                {annotation.note}
              </Box>
            </>
          )}
        </Box>
      )
      
      lastEnd = annotation.end_offset
    }
    
    // 添加剩余文本
    if (lastEnd < chapter.content.length) {
      parts.push(chapter.content.substring(lastEnd))
    }
    
    return parts
  }

  // 书签功能
  const loadBookmarks = async () => {
    if (!id) return
    try {
      setLoadingBookmarks(true)
      const response = await api.get<BookmarkInfo[]>(`/api/books/${id}/bookmarks`)
      setBookmarks(response.data)
    } catch (err) {
      console.error('加载书签失败:', err)
    } finally {
      setLoadingBookmarks(false)
    }
  }

  const addBookmark = async () => {
    if (!id) return
    try {
      // 获取当前章节标题
      const chapterTitle = chapters[currentChapter]?.title || `第${currentChapter + 1}章`
      
      // 计算当前滚动偏移
      let scrollOffset = 0
      if (contentRef.current) {
        const chapterEl = chapterRefs.current.get(currentChapter)
        if (chapterEl) {
          const containerRect = contentRef.current.getBoundingClientRect()
          const chapterRect = chapterEl.getBoundingClientRect()
          scrollOffset = Math.max(0, containerRect.top - chapterRect.top)
        }
      }
      
      const position = `${currentChapter}:${Math.round(scrollOffset)}`
      
      await api.post('/api/bookmarks', {
        book_id: parseInt(id),
        position: position,
        chapter_title: chapterTitle,
        note: null
      })
      
      // 重新加载书签列表
      await loadBookmarks()
      // 简单的成功提示，实际项目中可以使用 Snackbar
      // alert('书签添加成功') 
    } catch (err) {
      console.error('添加书签失败:', err)
      alert('添加书签失败')
    }
  }

  const deleteBookmark = async (bookmarkId: number) => {
    try {
      await api.delete(`/api/bookmarks/${bookmarkId}`)
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId))
    } catch (err) {
      console.error('删除书签失败:', err)
    }
  }

  // 搜索功能
  const performSearch = async (keyword: string, page: number = 0) => {
    if (!id || !keyword.trim()) return
    
    try {
      setSearching(true)
      const response = await api.get<SearchResult>(`/api/books/${id}/search`, {
        params: { keyword: keyword.trim(), page, page_size: 20 }
      })
      setSearchResults(response.data)
      setSearchPage(page)
    } catch (err) {
      console.error('搜索失败:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchKeyword.trim()) {
      performSearch(searchKeyword, 0)
    }
  }

  const goToSearchResult = (match: SearchMatch) => {
    setSearchOpen(false)
    
    // 跳转到该章节
    if (match.chapterIndex >= loadedRange.start && match.chapterIndex <= loadedRange.end) {
      scrollToChapter(match.chapterIndex)
    } else {
      loadChapterContent(match.chapterIndex)
    }
  }

  // 渲染高亮的上下文文本
  const renderHighlightedContext = (context: string, highlightStart: number, highlightEnd: number) => {
    const before = context.substring(0, highlightStart)
    const highlight = context.substring(highlightStart, highlightEnd)
    const after = context.substring(highlightEnd)
    
    return (
      <>
        {before}
        <Box component="span" sx={{ bgcolor: 'warning.main', color: 'warning.contrastText', px: 0.5, borderRadius: 0.5 }}>
          {highlight}
        </Box>
        {after}
      </>
    )
  }

  const goToBookmark = (bookmark: BookmarkInfo) => {
    setBookmarksOpen(false)
    
    // 解析位置信息
    const parts = bookmark.position.split(':')
    const chapterIndex = parseInt(parts[0]) || 0
    const scrollOffset = parseInt(parts[1]) || 0
    
    // 保存待恢复的偏移
    pendingScrollOffsetRef.current = scrollOffset
    
    // 如果章节在已加载范围内，直接滚动
    if (chapterIndex >= loadedRange.start && chapterIndex <= loadedRange.end) {
      scrollToChapter(chapterIndex, scrollOffset)
    } else {
      // 需要重新加载
      loadChapterContent(chapterIndex)
    }
  }

  // 检查当前位置是否已有书签
  const hasBookmarkAtCurrentPosition = () => {
    return bookmarks.some(b => {
      const parts = b.position.split(':')
      return parseInt(parts[0]) === currentChapter
    })
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
            fontSize: fontSize,
            lineHeight: lineHeight,
            fontFamily: fontFamily,
            letterSpacing: `${letterSpacing}px`,
            marginBottom: `${paragraphSpacing}em`,
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
          
          {/* 书签按钮 */}
          {!isEpub && (
            <IconButton 
              color="inherit" 
              onClick={(e) => { 
                e.stopPropagation()
                if (hasBookmarkAtCurrentPosition()) {
                  // 已有书签，打开书签列表
                  loadBookmarks()
                  setBookmarksOpen(true)
                } else {
                  // 添加书签
                  addBookmark()
                }
              }}
            >
              {hasBookmarkAtCurrentPosition() ? <Bookmark /> : <BookmarkBorder />}
            </IconButton>
          )}
          
          {/* 搜索按钮 (仅TXT) */}
          {!isEpub && (
            <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setSearchOpen(true) }}>
              <Search />
            </IconButton>
          )}
          
          {/* 批注按钮 (仅TXT) */}
          {!isEpub && (
            <IconButton 
              color="inherit" 
              onClick={(e) => { 
                e.stopPropagation()
                loadAnnotations()
                setAnnotationsOpen(true) 
              }}
            >
              <Edit />
            </IconButton>
          )}
          
          <IconButton color="inherit" onClick={(e) => { e.stopPropagation(); setTocOpen(true) }}>
            <Menu />
          </IconButton>
          <IconButton color="inherit" onClick={(e) => { 
            e.stopPropagation()
            loadBookmarks()
            setBookmarksOpen(true)
          }}>
            <Bookmark />
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
            {totalChapters === 0 && !isEpub && (
              <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">未识别到目录</Typography>
                <Typography variant="caption">可能是短篇小说或格式不支持</Typography>
              </Box>
            )}
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

      {/* 搜索抽屉 */}
      <Drawer anchor="right" open={searchOpen} onClose={() => setSearchOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 360, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">
              书内搜索
            </Typography>
            <IconButton size="small" onClick={() => setSearchOpen(false)}>
              <Close />
            </IconButton>
          </Box>
          
          {/* 搜索框 */}
          <Box component="form" onSubmit={handleSearchSubmit} sx={{ mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="输入关键词搜索..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchKeyword && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => { setSearchKeyword(''); setSearchResults(null) }}>
                      <Close fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>
          
          {/* 搜索结果 */}
          {searching ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : searchResults ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                找到 {searchResults.total} 个结果
                {searchResults.totalPages > 1 && ` (第 ${searchResults.page + 1}/${searchResults.totalPages} 页)`}
              </Typography>
              
              {searchResults.matches.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <Search sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    未找到匹配结果
                  </Typography>
                </Box>
              ) : (
                <>
                  <List sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
                    {searchResults.matches.map((match, idx) => (
                      <ListItem key={idx} disablePadding sx={{ mb: 1 }}>
                        <Paper 
                          elevation={1} 
                          sx={{ width: '100%', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                          onClick={() => goToSearchResult(match)}
                        >
                          <Box sx={{ p: 1.5 }}>
                            <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                              {match.chapterTitle}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.5 }}>
                              {renderHighlightedContext(match.context, match.highlightStart, match.highlightEnd)}
                            </Typography>
                          </Box>
                        </Paper>
                      </ListItem>
                    ))}
                  </List>
                  
                  {/* 分页 */}
                  {searchResults.totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
                      <IconButton 
                        size="small" 
                        disabled={searchPage === 0}
                        onClick={() => performSearch(searchKeyword, searchPage - 1)}
                      >
                        <ChevronLeft />
                      </IconButton>
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                        {searchPage + 1} / {searchResults.totalPages}
                      </Typography>
                      <IconButton 
                        size="small"
                        disabled={searchPage >= searchResults.totalPages - 1}
                        onClick={() => performSearch(searchKeyword, searchPage + 1)}
                      >
                        <ChevronRight />
                      </IconButton>
                    </Box>
                  )}
                </>
              )}
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <Search sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                输入关键词开始搜索
              </Typography>
              <Typography variant="caption" color="text.secondary">
                支持中英文搜索
              </Typography>
            </Box>
          )}
        </Box>
      </Drawer>

      {/* 批注弹出菜单 */}
      {showAnnotationPopup && selectionInfo?.rect && (
        <Paper
          elevation={4}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'fixed',
            left: Math.min(selectionInfo.rect.left + selectionInfo.rect.width / 2, window.innerWidth - 200),
            top: selectionInfo.rect.top - 60,
            transform: 'translateX(-50%)',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            zIndex: 9999,
            bgcolor: 'background.paper',
            borderRadius: 2,
          }}
        >
          {/* 颜色选择 */}
          {Object.entries(highlightColors).map(([color, config]) => (
            <IconButton
              key={color}
              size="small"
              onClick={() => setAnnotationColor(color as keyof typeof highlightColors)}
              sx={{
                width: 28,
                height: 28,
                bgcolor: config.bg,
                border: annotationColor === color ? '2px solid' : '1px solid',
                borderColor: annotationColor === color ? 'primary.main' : 'divider',
                '&:hover': { bgcolor: config.bg }
              }}
            />
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {/* 添加高亮 */}
          <IconButton size="small" onClick={createAnnotation} title="添加高亮">
            <FormatColorFill fontSize="small" />
          </IconButton>
          {/* 添加笔记 */}
          <IconButton 
            size="small" 
            onClick={() => {
              // 显示笔记输入框
              const note = prompt('添加笔记：', '')
              if (note !== null) {
                setAnnotationNote(note)
                createAnnotation()
              }
            }}
            title="添加笔记"
          >
            <Edit fontSize="small" />
          </IconButton>
        </Paper>
      )}

      {/* 批注抽屉 */}
      <Drawer anchor="right" open={annotationsOpen} onClose={() => setAnnotationsOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 360, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">
              笔记与高亮 ({annotations.length})
            </Typography>
            <Box>
              <IconButton size="small" onClick={exportAnnotations} title="导出笔记">
                <Download fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setAnnotationsOpen(false)}>
                <Close fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          
          {loadingAnnotations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : annotations.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <Edit sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                暂无笔记
              </Typography>
              <Typography variant="caption" color="text.secondary">
                选中文本可添加高亮和笔记
              </Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto' }}>
              {annotations.map((annotation) => (
                <ListItem 
                  key={annotation.id} 
                  disablePadding
                  sx={{ mb: 1 }}
                  secondaryAction={
                    <IconButton 
                      edge="end" 
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteAnnotation(annotation.id)
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  }
                >
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      width: '100%', 
                      cursor: 'pointer', 
                      '&:hover': { bgcolor: 'action.hover' },
                      borderLeft: 3,
                      borderColor: highlightColors[annotation.color]?.bg || highlightColors.yellow.bg,
                    }}
                    onClick={() => goToAnnotation(annotation)}
                  >
                    <Box sx={{ p: 1.5 }}>
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                        {annotation.chapter_title || `第${annotation.chapter_index + 1}章`}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          mt: 0.5, 
                          fontSize: 13, 
                          lineHeight: 1.5,
                          bgcolor: highlightColors[annotation.color]?.bg || highlightColors.yellow.bg,
                          p: 0.5,
                          borderRadius: 0.5,
                        }}
                      >
                        "{annotation.selected_text.length > 100 
                          ? annotation.selected_text.substring(0, 100) + '...' 
                          : annotation.selected_text}"
                      </Typography>
                      {annotation.note && (
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            mt: 1, 
                            fontSize: 13,
                            color: 'text.primary',
                            fontStyle: 'italic'
                          }}
                        >
                          📝 {annotation.note}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {new Date(annotation.created_at).toLocaleDateString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Typography>
                    </Box>
                  </Paper>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

      {/* 书签抽屉 */}
      <Drawer anchor="right" open={bookmarksOpen} onClose={() => setBookmarksOpen(false)} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ width: 320, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">
              书签 ({bookmarks.length})
            </Typography>
            {!isEpub && (
              <IconButton onClick={addBookmark} color="primary" size="small">
                <Add />
              </IconButton>
            )}
          </Box>
          
          {loadingBookmarks ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : bookmarks.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <BookmarkBorder sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                暂无书签
              </Typography>
              <Typography variant="caption" color="text.secondary">
                点击工具栏书签图标添加
              </Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto' }}>
              {bookmarks.map((bookmark) => {
                const parts = bookmark.position.split(':')
                const chapterIndex = parseInt(parts[0]) || 0
                const isCurrentChapter = chapterIndex === currentChapter
                
                return (
                  <ListItem 
                    key={bookmark.id} 
                    disablePadding
                    secondaryAction={
                      <IconButton 
                        edge="end" 
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteBookmark(bookmark.id)
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemButton
                      selected={isCurrentChapter}
                      onClick={() => goToBookmark(bookmark)}
                      sx={{ pr: 6 }}
                    >
                      <ListItemText
                        primary={bookmark.chapter_title || `第${chapterIndex + 1}章`}
                        secondary={
                          <Box component="span">
                            <Typography variant="caption" component="span" sx={{ display: 'block' }}>
                              {new Date(bookmark.created_at).toLocaleDateString('zh-CN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Typography>
                            {bookmark.note && (
                              <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                                {bookmark.note}
                              </Typography>
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                      />
                    </ListItemButton>
                  </ListItem>
                )
              })}
            </List>
          )}
        </Box>
      </Drawer>
    </Box>
  )
}
