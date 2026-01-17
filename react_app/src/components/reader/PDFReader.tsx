import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Box, CircularProgress, Typography } from '@mui/material';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// 设置 worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFReaderProps {
  url: string;
  token: string | null;
  onLoadSuccess: (total: number) => void;
  currentPage: number;
  scale: number;
  width?: number;
}

export default function PDFReader({ url, token, onLoadSuccess, currentPage, scale, width }: PDFReaderProps) {
  const [numPages, setNumPages] = useState<number | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    onLoadSuccess(numPages);
  }

  // 构建带 Token 的请求对象
  const file = {
    url: url,
    httpHeaders: token ? { 'Authorization': `Bearer ${token}` } : {},
    withCredentials: true,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        }
        error={
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="error">加载 PDF 失败</Typography>
          </Box>
        }
      >
        <Page 
          pageNumber={currentPage + 1} 
          scale={scale}
          width={width}
          loading={
            <Box sx={{ height: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          }
          error={
            <Box sx={{ height: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="error">加载页面失败</Typography>
            </Box>
          }
        />
      </Document>
      
      {numPages && (
        <Typography variant="caption" sx={{ mt: 2, mb: 4, color: 'text.secondary' }}>
          第 {currentPage + 1} / {numPages} 页
        </Typography>
      )}
    </Box>
  );
}
