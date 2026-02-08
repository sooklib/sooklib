import { useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Tabs, Tab, Typography, Container, FormControl, InputLabel, Select, MenuItem, useMediaQuery, useTheme } from '@mui/material'
import { People, LibraryBooks, Backup, Image, TextFields, LocalOffer, Psychology, Code, Settings, ReceiptLong, ListAlt } from '@mui/icons-material'
import SettingsTab from '../components/admin/SettingsTab'
import UsersTab from '../components/admin/UsersTab'
import LibrariesTab from '../components/admin/LibrariesTab'
import BackupTab from '../components/admin/BackupTab'
import CoversTab from '../components/admin/CoversTab'
import FontsTab from '../components/admin/FontsTab'
import TagsTab from '../components/admin/TagsTab'
import AITab from '../components/admin/AITab'
import PatternsTab from '../components/admin/PatternsTab'
import LogsTab from '../components/admin/LogsTab'
import ScanTasksTab from '../components/admin/ScanTasksTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

// Tab 名称映射
const TAB_NAMES = ['settings', 'users', 'libraries', 'scan-tasks', 'tags', 'patterns', 'ai', 'backup', 'covers', 'fonts', 'logs']

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const headingVariant = isMobile ? 'h6' : 'h5'
  
  // 从 URL 读取当前 tab
  const tabValue = useMemo(() => {
    const tabName = searchParams.get('tab')
    if (!tabName) return 0
    const index = TAB_NAMES.indexOf(tabName)
    return index >= 0 ? index : 0
  }, [searchParams])

  // 更新 tab 到 URL
  const handleTabChange = useCallback((newValue: number) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (newValue === 0) {
        newParams.delete('tab')  // 默认 tab 不需要在 URL 中
      } else {
        newParams.set('tab', TAB_NAMES[newValue])
      }
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 2 } }}>
      <Typography variant={headingVariant} fontWeight="bold" sx={{ mb: { xs: 2, sm: 3 } }}>
        后台管理
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        {isMobile ? (
          <FormControl fullWidth size="small">
            <InputLabel id="admin-tab-label">管理模块</InputLabel>
            <Select
              labelId="admin-tab-label"
              label="管理模块"
              value={tabValue}
              onChange={(event) => handleTabChange(Number(event.target.value))}
            >
              <MenuItem value={0}>系统设置</MenuItem>
              <MenuItem value={1}>用户管理</MenuItem>
              <MenuItem value={2}>书库管理</MenuItem>
              <MenuItem value={3}>任务队列</MenuItem>
              <MenuItem value={4}>标签管理</MenuItem>
              <MenuItem value={5}>文件名规则</MenuItem>
              <MenuItem value={6}>AI配置</MenuItem>
              <MenuItem value={7}>备份管理</MenuItem>
              <MenuItem value={8}>封面管理</MenuItem>
              <MenuItem value={9}>字体管理</MenuItem>
              <MenuItem value={10}>系统日志</MenuItem>
            </Select>
          </FormControl>
        ) : (
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => handleTabChange(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab icon={<Settings />} label="系统设置" iconPosition="start" />
            <Tab icon={<People />} label="用户管理" iconPosition="start" />
            <Tab icon={<LibraryBooks />} label="书库管理" iconPosition="start" />
            <Tab icon={<ListAlt />} label="任务队列" iconPosition="start" />
            <Tab icon={<LocalOffer />} label="标签管理" iconPosition="start" />
            <Tab icon={<Code />} label="文件名规则" iconPosition="start" />
            <Tab icon={<Psychology />} label="AI配置" iconPosition="start" />
            <Tab icon={<Backup />} label="备份管理" iconPosition="start" />
            <Tab icon={<Image />} label="封面管理" iconPosition="start" />
            <Tab icon={<TextFields />} label="字体管理" iconPosition="start" />
            <Tab icon={<ReceiptLong />} label="系统日志" iconPosition="start" />
          </Tabs>
        )}
      </Box>

      <TabPanel value={tabValue} index={0}>
        <SettingsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <UsersTab />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <LibrariesTab />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <ScanTasksTab />
      </TabPanel>
      <TabPanel value={tabValue} index={4}>
        <TagsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={5}>
        <PatternsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={6}>
        <AITab />
      </TabPanel>
      <TabPanel value={tabValue} index={7}>
        <BackupTab />
      </TabPanel>
      <TabPanel value={tabValue} index={8}>
        <CoversTab />
      </TabPanel>
      <TabPanel value={tabValue} index={9}>
        <FontsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={10}>
        <LogsTab />
      </TabPanel>
    </Container>
  )
}
