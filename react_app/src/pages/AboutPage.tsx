import { Box, Typography, Card, CardContent, Link, Stack, Chip } from '@mui/material'
import { useEffect, useState } from 'react'
import api from '../services/api'
import PageContainer from '../components/PageContainer'

export default function AboutPage() {
  const [version, setVersion] = useState<string>('unknown')

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await api.get('/api/version')
        setVersion(res.data?.version || 'unknown')
      } catch (error) {
        console.error('获取版本失败:', error)
      }
    }
    fetchVersion()
  }, [])

  return (
    <PageContainer>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>
        关于 Sooklib
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6">项目简介</Typography>
            <Typography variant="body2" color="text.secondary">
              Sooklib 是面向个人/家庭的书城与书库系统，强调找书、管理与阅读体验。
              在线阅读仅支持 TXT，并针对大文件与目录稳定性进行优化。
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6">版本信息</Typography>
            <Chip label={`当前版本: ${version}`} size="small" />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6">项目链接</Typography>
            <Typography variant="body2">
              GitHub 仓库：
              <Link href="https://github.com/sooklib/sooklib" target="_blank" rel="noopener">
                https://github.com/sooklib/sooklib
              </Link>
            </Typography>
            <Typography variant="body2">
              文档站：
              <Link href="https://github.com/sooklib/sooklib-docs" target="_blank" rel="noopener">
                https://github.com/sooklib/sooklib-docs
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
