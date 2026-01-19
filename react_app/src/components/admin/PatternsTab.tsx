import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react'
import {
  Box, Typography, Card, CardContent, TextField, Button, Alert,
  CircularProgress, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Switch, 
  Tooltip, Accordion, AccordionSummary, AccordionDetails, Select,
  MenuItem, FormControl, InputLabel
} from '@mui/material'
import {
  Add, Delete, Edit, PlayArrow, AutoAwesome, ExpandMore,
  Code, ContentCopy, Refresh, Lightbulb
} from '@mui/icons-material'
import api from '../../services/api'

// 错误边界组件
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PatternsTab Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          <Typography variant="h6">组件加载错误</Typography>
          <Typography variant="body2">{this.state.error?.message}</Typography>
          <Button 
            variant="outlined" 
            sx={{ mt: 1 }}
            onClick={() => window.location.reload()}
          >
            刷新页面
          </Button>
        </Alert>
      )
    }
    return this.props.children
  }
}

interface FilenamePattern {
  id: number
  name: string
  description: string | null
  regex_pattern: string
  title_group: number
  author_group: number
  extra_group: number
  tag_group: number
  priority: number
  is_active: boolean
  library_id: number | null
  match_count: number
  success_count: number
  accuracy_rate: number
  created_by: string
  created_at: string
  example_filename: string | null
  example_result: { title?: string; author?: string; extra?: string } | null
}

interface Library {
  id: number
  name: string
}

function PatternsTabContent() {
  const [loading, setLoading] = useState(true)
  const [patterns, setPatterns] = useState<FilenamePattern[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPattern, setEditingPattern] = useState<FilenamePattern | null>(null)
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false)
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    regex_pattern: '',
    title_group: 1,
    author_group: 2,
    extra_group: 0,
    tag_group: 0,
    priority: 0,
    library_id: null as number | null,
    example_filename: ''
  })
  
  // 测试状态
  const [testFilename, setTestFilename] = useState('')
  const [testRegex, setTestRegex] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  
  // 分析状态
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [addingPattern, setAddingPattern] = useState<number | null>(null)
  
  // AI建议规则状态
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false)
  const [suggestFilename, setSuggestFilename] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestResult, setSuggestResult] = useState<any>(null)

  useEffect(() => {
    loadPatterns()
    loadLibraries()
  }, [])

  const loadPatterns = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<FilenamePattern[]>('/api/admin/ai/patterns')
      setPatterns(response.data || [])
    } catch (err: any) {
      console.error('加载规则失败:', err)
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '加载规则失败')
      setPatterns([])
    } finally {
      setLoading(false)
    }
  }

  const loadLibraries = async () => {
    try {
      const response = await api.get<Library[]>('/api/libraries')
      // 确保返回数组
      const data = response.data
      if (Array.isArray(data)) {
        setLibraries(data)
      } else {
        console.error('书库数据格式错误，期望数组:', data)
        setLibraries([])
      }
    } catch (err) {
      console.error('加载书库失败:', err)
      setLibraries([])
    }
  }

  const handleCreate = () => {
    setEditingPattern(null)
    setFormData({
      name: '',
      description: '',
      regex_pattern: '',
      title_group: 1,
      author_group: 2,
      extra_group: 0,
      tag_group: 0,
      priority: 0,
      library_id: null,
      example_filename: ''
    })
    setDialogOpen(true)
  }

  const handleEdit = (pattern: FilenamePattern) => {
    setEditingPattern(pattern)
    setFormData({
      name: pattern.name,
      description: pattern.description || '',
      regex_pattern: pattern.regex_pattern,
      title_group: pattern.title_group,
      author_group: pattern.author_group,
      extra_group: pattern.extra_group,
      tag_group: pattern.tag_group || 0,
      priority: pattern.priority,
      library_id: pattern.library_id,
      example_filename: pattern.example_filename || ''
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingPattern) {
        await api.put(`/api/admin/ai/patterns/${editingPattern.id}`, formData)
        setSuccess('规则更新成功')
      } else {
        await api.post('/api/admin/ai/patterns', formData)
        setSuccess('规则创建成功')
      }
      setDialogOpen(false)
      loadPatterns()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '保存失败')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个规则吗？')) return
    
    try {
      await api.delete(`/api/admin/ai/patterns/${id}`)
      setSuccess('规则删除成功')
      loadPatterns()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '删除失败')
    }
  }

  const handleToggleActive = async (pattern: FilenamePattern) => {
    try {
      await api.put(`/api/admin/ai/patterns/${pattern.id}`, {
        is_active: !pattern.is_active
      })
      loadPatterns()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '更新失败')
    }
  }

  const handleTest = async () => {
    try {
      setTesting(true)
      const response = await api.post('/api/admin/ai/patterns/test', null, {
        params: {
          regex_pattern: testRegex,
          filename: testFilename,
          title_group: formData.title_group,
          author_group: formData.author_group,
          extra_group: formData.extra_group,
          tag_group: formData.tag_group
        }
      })
      setTestResult(response.data)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setTestResult({ success: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) || '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleAnalyzeLibrary = async () => {
    if (!selectedLibraryId) {
      setError('请选择书库')
      return
    }
    
    try {
      setAnalyzing(true)
      const response = await api.post(`/api/admin/ai/patterns/batch-analyze-library/${selectedLibraryId}`)
      setAnalysisResult(response.data)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  // 添加AI生成的规则到列表
  const handleAddAIPattern = async (pattern: any, index: number) => {
    try {
      setAddingPattern(index)
      await api.post('/api/admin/ai/patterns', {
        name: pattern.name || `AI规则${index + 1}`,
        regex_pattern: pattern.regex,
        title_group: pattern.title_group || 1,
        author_group: pattern.author_group || 2,
        extra_group: pattern.extra_group || 0,
        tag_group: pattern.tag_group || 0,
        priority: 0,
        library_id: selectedLibraryId,
        description: `AI自动生成，置信度: ${Math.round((pattern.confidence || 0) * 100)}%`
      })
      setSuccess(`规则 "${pattern.name}" 已添加`)
      // 标记该规则已添加
      setAnalysisResult((prev: any) => ({
        ...prev,
        patterns: prev.patterns.map((p: any, i: number) => 
          i === index ? { ...p, added: true } : p
        )
      }))
      loadPatterns()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || '添加规则失败')
    } finally {
      setAddingPattern(null)
    }
  }

  // 批量添加所有AI规则
  const handleAddAllAIPatterns = async () => {
    if (!analysisResult?.patterns?.length) return
    
    const patternsToAdd = analysisResult.patterns.filter((p: any) => !p.added && p.regex)
    if (patternsToAdd.length === 0) {
      setSuccess('所有规则已添加')
      return
    }
    
    let addedCount = 0
    for (const pattern of patternsToAdd) {
      try {
        await api.post('/api/admin/ai/patterns', {
          name: pattern.name || `AI规则`,
          regex_pattern: pattern.regex,
          title_group: pattern.title_group || 1,
          author_group: pattern.author_group || 2,
          extra_group: pattern.extra_group || 0,
          tag_group: pattern.tag_group || 0,
          priority: 0,
          library_id: selectedLibraryId,
          description: `AI自动生成，置信度: ${Math.round((pattern.confidence || 0) * 100)}%`
        })
        addedCount++
      } catch (err) {
        console.error('添加规则失败:', err)
      }
    }
    
    setSuccess(`已添加 ${addedCount} 个规则`)
    setAnalysisResult((prev: any) => ({
      ...prev,
      patterns: prev.patterns.map((p: any) => ({ ...p, added: true }))
    }))
    loadPatterns()
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Code /> 文件名解析规则
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={loadPatterns}
          >
            刷新
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoAwesome />}
            onClick={() => setAnalyzeDialogOpen(true)}
          >
            AI分析
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Lightbulb />}
            onClick={() => {
              setSuggestFilename('')
              setSuggestResult(null)
              setSuggestDialogOpen(true)
            }}
          >
            AI建议规则
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayArrow />}
            onClick={() => {
              setTestRegex('')
              setTestFilename('')
              setTestResult(null)
              setTestDialogOpen(true)
            }}
          >
            测试正则
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={handleCreate}
          >
            添加规则
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* 规则列表 */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>状态</TableCell>
              <TableCell>名称</TableCell>
              <TableCell>正则表达式</TableCell>
              <TableCell>捕获组</TableCell>
              <TableCell>优先级</TableCell>
              <TableCell>统计</TableCell>
              <TableCell>来源</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {patterns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">暂无规则，点击"添加规则"创建</Typography>
                </TableCell>
              </TableRow>
            ) : (
              patterns.map((pattern) => (
                <TableRow key={pattern.id}>
                  <TableCell>
                    <Switch
                      checked={pattern.is_active}
                      onChange={() => handleToggleActive(pattern)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {pattern.name}
                    </Typography>
                    {pattern.description && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {pattern.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={pattern.regex_pattern}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {pattern.regex_pattern}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      书名: {pattern.title_group} | 作者: {pattern.author_group}
                      {pattern.extra_group > 0 && ` | 额外: ${pattern.extra_group}`}
                      {pattern.tag_group > 0 && ` | 标签: ${pattern.tag_group}`}
                    </Typography>
                  </TableCell>
                  <TableCell>{pattern.priority}</TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      匹配: {pattern.match_count || 0} | 成功: {pattern.success_count || 0}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={pattern.created_by === 'ai' ? 'AI' : pattern.created_by === 'auto' ? '自动' : '手动'}
                      size="small"
                      color={pattern.created_by === 'ai' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleEdit(pattern)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(pattern.id)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 常用规则示例 */}
      <Accordion sx={{ mt: 2 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography>常用正则表达式示例</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {[
              { name: '作者-书名', regex: '^(.+?)-(.+?)\\.txt$', title: 2, author: 1 },
              { name: '【作者】书名', regex: '^【(.+?)】(.+?)\\.txt$', title: 2, author: 1 },
              { name: '《书名》作者', regex: '^《(.+?)》(.+?)\\.txt$', title: 1, author: 2 },
              { name: '书名 BY作者', regex: '^(.+?)\\s*BY\\s*(.+?)\\.txt$', title: 1, author: 2 },
              { name: '[系列]书名-作者', regex: '^\\[(.+?)\\](.+?)-(.+?)\\.txt$', title: 2, author: 3 },
            ].map((example, i) => (
              <Card key={i} variant="outlined" sx={{ minWidth: 250, flex: '1 1 250px', maxWidth: 350 }}>
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="subtitle2">{example.name}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                    {example.regex}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    书名组: {example.title} | 作者组: {example.author}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        name: example.name,
                        regex_pattern: example.regex,
                        title_group: example.title,
                        author_group: example.author
                      })
                      setDialogOpen(true)
                    }}
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </CardContent>
              </Card>
            ))}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingPattern ? '编辑规则' : '添加规则'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                sx={{ flex: '1 1 250px' }}
                label="规则名称"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <TextField
                sx={{ flex: '1 1 150px' }}
                type="number"
                label="优先级"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                helperText="数字越大优先级越高"
              />
            </Box>
            <TextField
              fullWidth
              label="描述"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <TextField
              fullWidth
              label="正则表达式"
              value={formData.regex_pattern}
              onChange={(e) => setFormData({ ...formData, regex_pattern: e.target.value })}
              placeholder="^(.+?)-(.+?)\.txt$"
              InputProps={{ sx: { fontFamily: 'monospace' } }}
              helperText="使用捕获组 () 来提取书名和作者"
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="书名捕获组"
                value={formData.title_group}
                onChange={(e) => setFormData({ ...formData, title_group: parseInt(e.target.value) || 1 })}
                inputProps={{ min: 1 }}
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="作者捕获组"
                value={formData.author_group}
                onChange={(e) => setFormData({ ...formData, author_group: parseInt(e.target.value) || 0 })}
                inputProps={{ min: 0 }}
                helperText="0表示无"
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="额外信息捕获组"
                value={formData.extra_group}
                onChange={(e) => setFormData({ ...formData, extra_group: parseInt(e.target.value) || 0 })}
                inputProps={{ min: 0 }}
                helperText="0表示无"
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="标签捕获组"
                value={formData.tag_group}
                onChange={(e) => setFormData({ ...formData, tag_group: parseInt(e.target.value) || 0 })}
                inputProps={{ min: 0 }}
                helperText="0表示无"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl sx={{ flex: '1 1 200px' }}>
                <InputLabel>关联书库（可选）</InputLabel>
                <Select
                  value={formData.library_id ?? ''}
                  label="关联书库（可选）"
                  onChange={(e) => setFormData({ ...formData, library_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <MenuItem value="">全局规则</MenuItem>
                  {libraries.map((lib) => (
                    <MenuItem key={lib.id} value={lib.id}>{lib.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                sx={{ flex: '1 1 200px' }}
                label="示例文件名"
                value={formData.example_filename}
                onChange={(e) => setFormData({ ...formData, example_filename: e.target.value })}
                placeholder="张三-我的小说.txt"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSave}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* 测试对话框 */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>测试正则表达式</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="正则表达式"
              value={testRegex}
              onChange={(e) => setTestRegex(e.target.value)}
              InputProps={{ sx: { fontFamily: 'monospace' } }}
            />
            <TextField
              fullWidth
              label="测试文件名"
              value={testFilename}
              onChange={(e) => setTestFilename(e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="书名组"
                value={formData.title_group}
                onChange={(e) => setFormData({ ...formData, title_group: parseInt(e.target.value) || 1 })}
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="作者组"
                value={formData.author_group}
                onChange={(e) => setFormData({ ...formData, author_group: parseInt(e.target.value) || 0 })}
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="额外组"
                value={formData.extra_group}
                onChange={(e) => setFormData({ ...formData, extra_group: parseInt(e.target.value) || 0 })}
              />
              <TextField
                sx={{ flex: '1 1 100px' }}
                type="number"
                label="标签组"
                value={formData.tag_group}
                onChange={(e) => setFormData({ ...formData, tag_group: parseInt(e.target.value) || 0 })}
              />
            </Box>
            <Button
              variant="contained"
              onClick={handleTest}
              disabled={testing || !testRegex || !testFilename}
              startIcon={testing ? <CircularProgress size={20} /> : <PlayArrow />}
            >
              测试
            </Button>
            {testResult && (
              <Alert severity={testResult.success ? 'success' : 'error'}>
                {testResult.success ? (
                  <Box>
                    <Typography variant="body2">匹配成功！</Typography>
                    <Typography variant="body2">书名: {testResult.parsed?.title || '无'}</Typography>
                    <Typography variant="body2">作者: {testResult.parsed?.author || '无'}</Typography>
                    {testResult.parsed?.extra && (
                      <Typography variant="body2">额外: {testResult.parsed.extra}</Typography>
                    )}
                    {testResult.parsed?.tags && (
                      <Typography variant="body2">标签: {testResult.parsed.tags}</Typography>
                    )}
                  </Box>
                ) : (
                  typeof testResult.error === 'string' ? testResult.error : JSON.stringify(testResult.error) || '匹配失败'
                )}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* AI分析对话框 */}
      <Dialog open={analyzeDialogOpen} onClose={() => setAnalyzeDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesome /> AI 分析书库文件名
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            选择一个书库，AI将分析其中的文件名命名模式并自动生成解析规则。
          </Typography>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>选择书库</InputLabel>
            <Select
              value={selectedLibraryId ?? ''}
              label="选择书库"
              onChange={(e) => setSelectedLibraryId(e.target.value ? Number(e.target.value) : null)}
            >
              {libraries.map((lib) => (
                <MenuItem key={lib.id} value={lib.id}>{lib.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button
            variant="contained"
            onClick={handleAnalyzeLibrary}
            disabled={analyzing || !selectedLibraryId}
            startIcon={analyzing ? <CircularProgress size={20} /> : <AutoAwesome />}
          >
            开始分析
          </Button>

          {analysisResult && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={analysisResult.success ? 'success' : 'error'} sx={{ mb: 2 }}>
                {analysisResult.success 
                  ? `分析完成！发现 ${analysisResult.patterns?.length || 0} 种模式`
                  : analysisResult.error || '分析失败'
                }
              </Alert>
              
              {analysisResult.patterns_created?.length > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  已自动创建规则: {analysisResult.patterns_created.join(', ')}
                </Alert>
              )}

              {analysisResult.analysis && (
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {analysisResult.analysis}
                </Typography>
              )}

              {analysisResult.patterns?.length > 0 && (
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<Add />}
                    onClick={handleAddAllAIPatterns}
                    disabled={analysisResult.patterns.every((p: any) => p.added)}
                  >
                    添加全部规则
                  </Button>
                </Box>
              )}

              {analysisResult.patterns?.map((p: any, i: number) => (
                <Card 
                  key={i} 
                  variant="outlined" 
                  sx={{ 
                    mb: 1,
                    bgcolor: p.added ? 'action.selected' : 'inherit',
                    opacity: p.added ? 0.7 : 1
                  }}
                >
                  <CardContent sx={{ py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2">
                        {p.name}
                        {p.added && <Chip label="已添加" size="small" color="success" sx={{ ml: 1 }} />}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>
                        {p.regex}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        置信度: {Math.round((p.confidence || 0) * 100)}% | 
                        书名组: {p.title_group || 1} | 作者组: {p.author_group || 2}
                        {p.tag_group > 0 && ` | 标签组: ${p.tag_group}`}
                      </Typography>
                    </Box>
                    {!p.added && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={addingPattern === i ? <CircularProgress size={16} /> : <Add />}
                        onClick={() => handleAddAIPattern(p, i)}
                        disabled={addingPattern !== null}
                        sx={{ ml: 1, flexShrink: 0 }}
                      >
                        添加
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAnalyzeDialogOpen(false)
            loadPatterns()  // 刷新规则列表
          }}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* AI建议规则对话框 */}
      <Dialog open={suggestDialogOpen} onClose={() => setSuggestDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Lightbulb /> AI 建议规则
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            输入一个文件名，AI 将根据现有规则和文件名模式，为你建议一个合适的解析规则。
          </Typography>
          
          <TextField
            fullWidth
            label="文件名"
            value={suggestFilename}
            onChange={(e) => setSuggestFilename(e.target.value)}
            placeholder="例如：张三-我的小说.txt"
            sx={{ mb: 2 }}
          />
          
          <Button
            variant="contained"
            onClick={async () => {
              if (!suggestFilename.trim()) return
              try {
                setSuggesting(true)
                setSuggestResult(null)
                const response = await api.post('/api/admin/ai/patterns/suggest', null, {
                  params: { filename: suggestFilename }
                })
                setSuggestResult(response.data)
              } catch (err: any) {
                setSuggestResult({
                  success: false,
                  error: err.response?.data?.detail || '建议失败'
                })
              } finally {
                setSuggesting(false)
              }
            }}
            disabled={suggesting || !suggestFilename.trim()}
            startIcon={suggesting ? <CircularProgress size={20} /> : <Lightbulb />}
          >
            获取建议
          </Button>

          {suggestResult && (
            <Box sx={{ mt: 2 }}>
              {suggestResult.success === false ? (
                <Alert severity="error">
                  {typeof suggestResult.error === 'string' ? suggestResult.error : JSON.stringify(suggestResult.error)}
                </Alert>
              ) : (
                <>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    AI 建议了以下规则
                  </Alert>
                  
                  {suggestResult.regex && (
                    <Card variant="outlined" sx={{ mb: 2 }}>
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          建议的正则表达式
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', mb: 1 }}>
                          {suggestResult.regex}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          书名组: {suggestResult.title_group || 1} | 
                          作者组: {suggestResult.author_group || 2}
                          {suggestResult.extra_group > 0 && ` | 额外组: ${suggestResult.extra_group}`}
                        </Typography>
                        
                        {suggestResult.parsed && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" display="block">
                              <strong>解析结果：</strong>
                            </Typography>
                            <Typography variant="caption" display="block">
                              书名：{suggestResult.parsed.title || '无'}
                            </Typography>
                            <Typography variant="caption" display="block">
                              作者：{suggestResult.parsed.author || '无'}
                            </Typography>
                          </Box>
                        )}
                        
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Add />}
                          sx={{ mt: 1 }}
                          onClick={() => {
                            setFormData({
                              ...formData,
                              name: suggestResult.name || 'AI建议规则',
                              regex_pattern: suggestResult.regex,
                              title_group: suggestResult.title_group || 1,
                              author_group: suggestResult.author_group || 2,
                              extra_group: suggestResult.extra_group || 0,
                              description: 'AI 建议生成',
                              example_filename: suggestFilename
                            })
                            setSuggestDialogOpen(false)
                            setDialogOpen(true)
                          }}
                        >
                          使用此规则
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  
                  {suggestResult.explanation && (
                    <Typography variant="body2" color="text.secondary">
                      {suggestResult.explanation}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default function PatternsTab() {
  return (
    <ErrorBoundary>
      <PatternsTabContent />
    </ErrorBoundary>
  )
}
