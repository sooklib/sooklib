import { Box, Card, CardContent, Typography, Skeleton, Chip } from '@mui/material'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { BookSummary } from '../types'
import { usePrimaryColor } from '../stores/themeStore'
import { generateMorandiPalette } from '../utils/colorUtils'

interface BookCardProps {
  book?: BookSummary
  loading?: boolean
  onClick?: () => void
}

// 根据标题选择颜色索引
const getColorIndex = (title: string): number => {
  let hash = 0
  const titleStr = String(title || '')
  for (let i = 0; i < titleStr.length; i++) {
    hash = ((hash << 5) - hash) + titleStr.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) % 6
}

export default function BookCard({ book, loading = false, onClick }: BookCardProps) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const primaryColor = usePrimaryColor()
  
  // 根据主题色生成莫兰迪调色板
  const morandiPalette = useMemo(() => generateMorandiPalette(primaryColor), [primaryColor])

  if (loading) {
    return (
      <Card sx={{ height: '100%' }}>
        <Skeleton variant="rectangular" sx={{ aspectRatio: '2/3' }} />
        <CardContent sx={{ p: 1.5 }}>
          <Skeleton width="80%" />
          <Skeleton width="60%" />
        </CardContent>
      </Card>
    )
  }

  if (!book) return null

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      navigate(`/book/${book.id}`)
    }
  }

  const showFallback = !book.cover_url || imageError
  const coverColor = morandiPalette[getColorIndex(book.title)]

  return (
    <Card
      sx={{
        height: '100%',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
      onClick={handleClick}
    >
      {/* 封面图 */}
      <Box
        sx={{
          aspectRatio: '2/3',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {showFallback ? (
          // 主题色莫兰迪风格背景 + 图标 + 书名
          <Box
            sx={{
              width: '100%',
              height: '100%',
              bgcolor: coverColor,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
            }}
          >
            {/* 书籍图标 */}
            <MenuBookIcon
              sx={{
                fontSize: { xs: 64, sm: 80 },
                color: 'rgba(255, 255, 255, 0.9)',
                mb: 2,
              }}
            />
            {/* 书名 */}
            <Typography
              sx={{
                fontSize: { xs: '0.85rem', sm: '0.95rem' },
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.95)',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.4,
                px: 1,
                width: '100%',
              }}
            >
              {book.title}
            </Typography>
          </Box>
        ) : (
          <Box
            component="img"
            src={`/api${book.cover_url}`}
            alt={book.title}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={() => setImageError(true)}
          />
        )}

        {/* 新书标签 */}
        {book.is_new && (
          <Chip
            label="NEW"
            size="small"
            color="secondary"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              fontSize: '0.65rem',
              height: 20,
            }}
          />
        )}

        {/* 格式标签 */}
        {book.file_format && (
          <Chip
            label={book.file_format.toUpperCase()}
            size="small"
            sx={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              fontSize: '0.65rem',
              height: 20,
              bgcolor: 'rgba(0,0,0,0.7)',
              color: 'white',
            }}
          />
        )}
      </Box>

      {/* 书籍信息 */}
      <CardContent sx={{ p: 1.5 }}>
        <Typography
          variant="body2"
          fontWeight="medium"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.3,
            minHeight: '2.6em',
          }}
        >
          {book.title}
        </Typography>
        {book.author_name && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mt: 0.5,
            }}
          >
            {book.author_name}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
