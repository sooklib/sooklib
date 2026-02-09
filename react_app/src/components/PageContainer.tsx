import { Box, type BoxProps, useMediaQuery, useTheme } from '@mui/material'

const PageContainer = ({ children, sx, ...rest }: BoxProps) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 2.5, md: 3 },
        pt: { xs: 2, md: 3 },
        pb: { xs: 2, md: 3 },
        bgcolor: 'background.default',
        minHeight: '100%',
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  )
}

export default PageContainer
