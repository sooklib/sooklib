import { Box, IconButton, Select, MenuItem, Typography, FormControl, SelectChangeEvent } from '@mui/material'
import { KeyboardDoubleArrowLeft, KeyboardArrowLeft, KeyboardArrowRight, KeyboardDoubleArrowRight } from '@mui/icons-material'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
}

export default function Pagination({ page, totalPages, onPageChange, disabled = false }: PaginationProps) {
  // 生成页码数组
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  
  const handleSelectChange = (event: SelectChangeEvent<number>) => {
    onPageChange(event.target.value as number)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* 首页按钮 */}
      <IconButton
        onClick={() => onPageChange(1)}
        disabled={disabled || page <= 1}
        size="small"
        title="首页"
      >
        <KeyboardDoubleArrowLeft />
      </IconButton>

      {/* 上一页按钮 */}
      <IconButton
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        size="small"
        title="上一页"
      >
        <KeyboardArrowLeft />
      </IconButton>

      {/* 页码选择器和信息 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mx: 2 }}>
        <Typography variant="body2" color="text.secondary">
          第
        </Typography>
        <FormControl size="small" sx={{ minWidth: 70 }}>
          <Select
            value={page}
            onChange={handleSelectChange}
            disabled={disabled}
            sx={{ 
              '& .MuiSelect-select': { py: 0.5 },
            }}
            MenuProps={{
              PaperProps: {
                sx: { maxHeight: 300 }
              }
            }}
          >
            {pages.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          页，共 {totalPages} 页
        </Typography>
      </Box>

      {/* 下一页按钮 */}
      <IconButton
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        size="small"
        title="下一页"
      >
        <KeyboardArrowRight />
      </IconButton>

      {/* 尾页按钮 */}
      <IconButton
        onClick={() => onPageChange(totalPages)}
        disabled={disabled || page >= totalPages}
        size="small"
        title="尾页"
      >
        <KeyboardDoubleArrowRight />
      </IconButton>
    </Box>
  )
}
