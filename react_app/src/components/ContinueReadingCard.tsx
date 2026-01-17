import { Box, Card, CardContent, Typography, LinearProgress, Skeleton } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { ContinueReadingItem } from '../types'

interface ContinueReadingCardProps {
  item?: ContinueReadingItem
  loading?: boolean
}

export default function ContinueReadingCard({ item, loading = false }: ContinueReadingCardProps) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <Card sx={{ display: 'flex', height: 120 }}>
        <Skeleton variant="rectangular" width={80} height={120} />
        <CardContent sx={{ flex: 1, p: 1.5 }}>
          <Skeleton width="70%" />
          <Skeleton width="50%" />
          <Skeleton width="30%" sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    )
  }

  if (!item) return null

  const progressPercent = Math.round(item.progress * 100)

  return (
    <Card
      sx={{
        display: 'flex',
        height: 120,
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
      onClick={() => navigate(`/book/${item.id}/reader`)}
    >
      {/* 封面 */}
      <Box
        sx={{
          width: 80,
          height: 120,
          flexShrink: 0,
          bgcolor: 'grey.800',
          overflow: 'hidden',
        }}
      >
        {item.cover_url ? (
          <Box
            component="img"
            src={`/api${item.cover_url}`}
            alt={item.title}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'grey.700',
            }}
          >
            <Typography variant="h5" color="grey.500">
              📖
            </Typography>
          </Box>
        )}
      </Box>

      {/* 信息 */}
      <CardContent sx={{ flex: 1, p: 1.5, display: 'flex', flexDirection: 'column' }}>
        <Typography
          variant="body2"
          fontWeight="medium"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </Typography>
        
        {item.author_name && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.author_name}
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {item.library_name}
        </Typography>

        <Box sx={{ mt: 'auto', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              阅读进度
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <LinearProgress
                variant="determinate"
                value={progressPercent}
                sx={{ height: 4, borderRadius: 2 }}
              />
            </Box>
            <Typography variant="caption" color="primary" fontWeight="medium" sx={{ flexShrink: 0 }}>
              {progressPercent}%
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}
