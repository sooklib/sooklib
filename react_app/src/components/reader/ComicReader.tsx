import { useState, useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import api from '../../services/api';

interface ComicImage {
  filename: string;
  size: number;
}

interface ComicReaderProps {
  bookId: string;
  images: ComicImage[];
  currentPage: number;
  onPageLoad: (index: number) => void;
  width?: number;
  scale?: number;
}

export default function ComicReader({ bookId, images, currentPage, onPageLoad, width, scale = 1.0 }: ComicReaderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageCache = useState<Map<number, string>>(new Map())[0];

  // 加载指定页面的图片
  const loadImage = async (index: number): Promise<string | null> => {
    if (index < 0 || index >= images.length) return null;
    
    // 如果缓存中有，直接返回
    if (imageCache.has(index)) {
      return imageCache.get(index)!;
    }

    try {
      const response = await api.get(`/api/books/${bookId}/comic/page/${index}`, {
        responseType: 'blob'
      });
      
      const url = URL.createObjectURL(response.data);
      imageCache.set(index, url);
      return url;
    } catch (err) {
      console.error(`加载第 ${index + 1} 页失败:`, err);
      return null;
    }
  };

  // 清理不需要的缓存
  const cleanCache = (currentIndex: number) => {
    const keepRange = 5; // 保留前后5页
    const keysToDelete: number[] = [];
    
    for (const key of imageCache.keys()) {
      if (key < currentIndex - keepRange || key > currentIndex + keepRange) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      const url = imageCache.get(key);
      if (url) URL.revokeObjectURL(url);
      imageCache.delete(key);
    });
  };

  useEffect(() => {
    let mounted = true;
    
    const loadCurrentAndPreload = async () => {
      setLoading(true);
      setError(false);
      
      // 1. 加载当前页
      const url = await loadImage(currentPage);
      
      if (mounted) {
        if (url) {
          setImageUrl(url);
          setLoading(false);
          onPageLoad(currentPage);
        } else {
          setError(true);
          setLoading(false);
        }
      }

      // 2. 预加载后 2 页
      if (currentPage + 1 < images.length) loadImage(currentPage + 1);
      if (currentPage + 2 < images.length) loadImage(currentPage + 2);
      
      // 3. 预加载前 1 页
      if (currentPage > 0) loadImage(currentPage - 1);
      
      // 4. 清理旧缓存
      cleanCache(currentPage);
    };
    
    loadCurrentAndPreload();
    
    return () => {
      mounted = false;
    };
  }, [bookId, currentPage, images]);

  // 组件卸载时清理所有缓存
  useEffect(() => {
    return () => {
      imageCache.forEach(url => URL.revokeObjectURL(url));
      imageCache.clear();
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', justifyContent: 'center' }}>
      {loading && (
        <Box sx={{ p: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {error && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="error">加载图片失败</Typography>
        </Box>
      )}
      
      {imageUrl && !loading && !error && (
        <img 
          src={imageUrl} 
          alt={`Page ${currentPage + 1}`}
          style={{ 
            maxWidth: scale > 1 ? 'none' : '100%', 
            maxHeight: scale > 1 ? 'none' : '100vh', 
            objectFit: 'contain',
            width: width ? `${width}px` : 'auto',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        />
      )}
      
      <Typography variant="caption" sx={{ mt: 2, mb: 4, color: 'text.secondary' }}>
        第 {currentPage + 1} / {images.length} 页
      </Typography>
    </Box>
  );
}
