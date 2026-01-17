import { useState, useEffect } from 'react'
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, FormControlLabel, Switch, Alert, CircularProgress,
  Checkbox, List, ListItem, ListItemText, ListItemSecondaryAction, Divider
} from '@mui/material'
import { Add, Edit, Delete, VpnKey, LocalLibrary, Settings } from '@mui/icons-material'
import api from '../../services/api'

interface User {
  id: number
  username: string
  is_admin: boolean
  age_rating_limit: string
  telegram_id: string | null
  created_at: string
  library_count: number
}

interface LibraryAccess {
  library_id: number
  library_name: string
  has_access: boolean
  is_public: boolean
}

interface UserLibraryAccess {
  user_id: number
  username: string
  is_admin: boolean
  libraries: LibraryAccess[]
}

interface DefaultLibrarySettings {
  default_library_ids: number[]
}

export default function UsersTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [libraries, setLibraries] = useState<{id: number, name: string, is_public: boolean}[]>([])
  
  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'create' | 'edit' | 'password' | 'library-access'>('create')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  // 表单数据
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    is_admin: false,
    age_rating_limit: 'all'
  })
  
  // 书库权限数据
  const [libraryAccess, setLibraryAccess] = useState<LibraryAccess[]>([])
  const [libraryAccessLoading, setLibraryAccessLoading] = useState(false)
  
  // 默认书库设置对话框
  const [defaultLibraryDialogOpen, setDefaultLibraryDialogOpen] = useState(false)
  const [defaultLibraryIds, setDefaultLibraryIds] = useState<number[]>([])

  useEffect(() => {
    loadUsers()
    loadLibraries()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<User[]>('/api/admin/users')
      setUsers(response.data)
    } catch (err) {
      console.error('加载用户列表失败:', err)
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadLibraries = async () => {
    try {
      const response = await api.get<{id: number, name: string, is_public: boolean}[]>('/api/libraries')
      setLibraries(response.data)
    } catch (err) {
      console.error('加载书库列表失败:', err)
    }
  }

  const handleCreate = () => {
    setDialogType('create')
    setSelectedUser(null)
    setFormData({ username: '', password: '', is_admin: false, age_rating_limit: 'all' })
    setDialogOpen(true)
  }

  const handleEdit = (user: User) => {
    setDialogType('edit')
    setSelectedUser(user)
    setFormData({
      username: user.username,
      password: '',
      is_admin: user.is_admin,
      age_rating_limit: user.age_rating_limit
    })
    setDialogOpen(true)
  }

  const handleResetPassword = (user: User) => {
    setDialogType('password')
    setSelectedUser(user)
    setFormData({ ...formData, password: '' })
    setDialogOpen(true)
  }

  const handleLibraryAccess = async (user: User) => {
    setDialogType('library-access')
    setSelectedUser(user)
    setLibraryAccessLoading(true)
    setDialogOpen(true)
    
    try {
      const response = await api.get<UserLibraryAccess>(`/api/admin/users/${user.id}/library-access`)
      setLibraryAccess(response.data.libraries)
    } catch (err) {
      console.error('加载书库权限失败:', err)
      setError('加载书库权限失败')
    } finally {
      setLibraryAccessLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      setError('')
      
      if (dialogType === 'create') {
        await api.post('/api/admin/users', {
          username: formData.username,
          password: formData.password,
          is_admin: formData.is_admin,
          age_rating_limit: formData.age_rating_limit
        })
        setSuccess('用户创建成功')
      } else if (dialogType === 'edit' && selectedUser) {
        await api.put(`/api/admin/users/${selectedUser.id}`, {
          username: formData.username,
          is_admin: formData.is_admin,
          age_rating_limit: formData.age_rating_limit
        })
        setSuccess('用户更新成功')
      } else if (dialogType === 'password' && selectedUser) {
        await api.put(`/api/admin/users/${selectedUser.id}/password`, {
          new_password: formData.password
        })
        setSuccess('密码重置成功')
      } else if (dialogType === 'library-access' && selectedUser) {
        const selectedIds = libraryAccess
          .filter(lib => lib.has_access && !lib.is_public)
          .map(lib => lib.library_id)
        
        await api.put(`/api/admin/users/${selectedUser.id}/library-access`, {
          library_ids: selectedIds
        })
        setSuccess('书库权限更新成功')
      }
      
      setDialogOpen(false)
      loadUsers()
      
      // 3秒后清除成功消息
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      console.error('操作失败:', err)
      setError(err.response?.data?.detail || '操作失败')
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) return
    try {
      await api.delete(`/api/admin/users/${user.id}`)
      setSuccess('用户已删除')
      loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      console.error('删除失败:', err)
      setError(err.response?.data?.detail || '删除失败')
    }
  }

  const toggleLibraryAccess = (libraryId: number) => {
    setLibraryAccess(prev => prev.map(lib => 
      lib.library_id === libraryId && !lib.is_public
        ? { ...lib, has_access: !lib.has_access }
        : lib
    ))
  }

  const selectAllLibraries = () => {
    setLibraryAccess(prev => prev.map(lib => 
      lib.is_public ? lib : { ...lib, has_access: true }
    ))
  }

  const clearAllLibraries = () => {
    setLibraryAccess(prev => prev.map(lib => 
      lib.is_public ? lib : { ...lib, has_access: false }
    ))
  }

  const handleDefaultLibrarySettings = async () => {
    setDefaultLibraryDialogOpen(true)
    // 这里需要从设置 API 获取默认书库
    // 暂时使用公开书库作为默认
    const publicIds = libraries.filter(lib => lib.is_public).map(lib => lib.id)
    setDefaultLibraryIds(publicIds)
  }

  const saveDefaultLibrarySettings = async () => {
    try {
      // TODO: 实现保存默认书库设置的 API
      // await api.put('/api/admin/settings/default-libraries', { library_ids: defaultLibraryIds })
      setSuccess('默认书库设置已保存（功能开发中）')
      setDefaultLibraryDialogOpen(false)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('保存失败')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">用户列表</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="outlined" 
            startIcon={<Settings />} 
            onClick={handleDefaultLibrarySettings}
            size="small"
          >
            默认书库权限
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={handleCreate}>
            新建用户
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>用户名</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>年龄分级</TableCell>
              <TableCell>书库权限</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {user.username}
                    {user.telegram_id && (
                      <Chip label="TG" size="small" color="info" />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.is_admin ? '管理员' : '普通用户'}
                    color={user.is_admin ? 'primary' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{user.age_rating_limit}</TableCell>
                <TableCell>
                  <Chip
                    label={user.is_admin ? '全部' : `${user.library_count} 个`}
                    size="small"
                    color={user.is_admin ? 'success' : 'default'}
                    variant="outlined"
                    onClick={() => !user.is_admin && handleLibraryAccess(user)}
                    sx={{ cursor: user.is_admin ? 'default' : 'pointer' }}
                  />
                </TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell>
                  <IconButton 
                    size="small" 
                    onClick={() => handleLibraryAccess(user)} 
                    title="书库权限"
                    disabled={user.is_admin}
                  >
                    <LocalLibrary fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleEdit(user)} title="编辑">
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleResetPassword(user)} title="重置密码">
                    <VpnKey fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(user)} title="删除" color="error">
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 用户对话框 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogType === 'create' ? '新建用户' : 
           dialogType === 'edit' ? '编辑用户' : 
           dialogType === 'password' ? '重置密码' :
           '设置书库权限'}
        </DialogTitle>
        <DialogContent>
          {dialogType === 'library-access' ? (
            // 书库权限设置
            <Box sx={{ pt: 1 }}>
              {libraryAccessLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    为用户 <strong>{selectedUser?.username}</strong> 设置可访问的书库。
                    管理员自动拥有所有书库权限。
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Button size="small" variant="outlined" onClick={selectAllLibraries}>
                      全选
                    </Button>
                    <Button size="small" variant="outlined" onClick={clearAllLibraries}>
                      清空
                    </Button>
                  </Box>
                  
                  <List>
                    {libraryAccess.map((lib) => (
                      <ListItem
                        key={lib.library_id}
                        sx={{ 
                          bgcolor: lib.is_public ? 'action.hover' : 'transparent',
                          borderRadius: 1,
                          mb: 0.5
                        }}
                      >
                        <Checkbox
                          checked={lib.has_access}
                          onChange={() => toggleLibraryAccess(lib.library_id)}
                          disabled={lib.is_public}
                        />
                        <ListItemText
                          primary={lib.library_name}
                          secondary={lib.is_public ? '公开书库（所有用户可访问）' : null}
                        />
                        {lib.is_public && (
                          <Chip label="公开" size="small" color="success" variant="outlined" />
                        )}
                      </ListItem>
                    ))}
                  </List>
                  
                  {libraryAccess.length === 0 && (
                    <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                      暂无书库
                    </Typography>
                  )}
                </>
              )}
            </Box>
          ) : (
            // 创建/编辑/重置密码表单
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {dialogType !== 'password' && (
                <>
                  <TextField
                    label="用户名"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    fullWidth
                    required
                  />
                  <FormControl fullWidth>
                    <InputLabel>年龄分级限制</InputLabel>
                    <Select
                      value={formData.age_rating_limit}
                      label="年龄分级限制"
                      onChange={(e) => setFormData({ ...formData, age_rating_limit: e.target.value })}
                    >
                      <MenuItem value="all">全部</MenuItem>
                      <MenuItem value="G">G (全年龄)</MenuItem>
                      <MenuItem value="PG">PG (家长指导)</MenuItem>
                      <MenuItem value="PG-13">PG-13 (13岁以上)</MenuItem>
                      <MenuItem value="R">R (17岁以上)</MenuItem>
                      <MenuItem value="NC-17">NC-17 (成人)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.is_admin}
                        onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                      />
                    }
                    label="管理员权限"
                  />
                </>
              )}
              {(dialogType === 'create' || dialogType === 'password') && (
                <TextField
                  label={dialogType === 'create' ? '密码' : '新密码'}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  fullWidth
                  required
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button 
            variant="contained" 
            onClick={handleSubmit}
            disabled={dialogType === 'library-access' && libraryAccessLoading}
          >
            确定
          </Button>
        </DialogActions>
      </Dialog>

      {/* 默认书库权限设置对话框 */}
      <Dialog 
        open={defaultLibraryDialogOpen} 
        onClose={() => setDefaultLibraryDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>默认书库权限设置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            设置新用户创建时默认可访问的书库。也可以将书库设为"公开"，这样所有用户都能访问。
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle2" sx={{ mb: 1 }}>当前公开书库</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {libraries.filter(lib => lib.is_public).map(lib => (
              <Chip key={lib.id} label={lib.name} color="success" size="small" />
            ))}
            {libraries.filter(lib => lib.is_public).length === 0 && (
              <Typography variant="body2" color="text.secondary">无</Typography>
            )}
          </Box>
          
          <Typography variant="body2" color="text.secondary">
            提示：在"书库管理"中可以设置书库为公开。公开书库对所有用户可见，无需单独授权。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDefaultLibraryDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
