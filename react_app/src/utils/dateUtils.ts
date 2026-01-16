/**
 * 日期时间工具函数
 * 处理后端返回的ISO时间字符串，统一转换为用户本地时区显示
 */

/**
 * 解析后端返回的ISO时间字符串
 * 后端返回的时间可能是：
 * - 带时区：2026-01-17T03:55:00+00:00
 * - 不带时区（UTC）：2026-01-17T03:55:00
 * 
 * 如果不带时区，默认当作UTC时间处理
 */
export function parseDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  
  try {
    // 检查是否已有时区信息
    if (isoString.includes('+') || isoString.includes('Z') || isoString.match(/[+-]\d{2}:\d{2}$/)) {
      return new Date(isoString);
    }
    // 如果没有时区信息，假设是UTC时间，添加Z后缀
    return new Date(isoString + 'Z');
  } catch {
    return null;
  }
}

/**
 * 格式化日期为本地日期字符串
 * 例如：2026年1月17日
 */
export function formatDate(isoString: string | null | undefined): string {
  const date = parseDate(isoString);
  if (!date || isNaN(date.getTime())) return '-';
  
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 格式化日期为短日期字符串
 * 例如：2026/01/17
 */
export function formatDateShort(isoString: string | null | undefined): string {
  const date = parseDate(isoString);
  if (!date || isNaN(date.getTime())) return '-';
  
  return date.toLocaleDateString('zh-CN');
}

/**
 * 格式化日期时间为完整字符串
 * 例如：2026年1月17日 上午3:55
 */
export function formatDateTime(isoString: string | null | undefined): string {
  const date = parseDate(isoString);
  if (!date || isNaN(date.getTime())) return '-';
  
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * 格式化为相对时间
 * 例如：刚刚、5分钟前、2小时前、昨天、3天前
 */
export function formatRelativeTime(isoString: string | null | undefined): string {
  const date = parseDate(isoString);
  if (!date || isNaN(date.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
  return `${Math.floor(diffDays / 365)}年前`;
}

/**
 * 格式化为友好时间（相对时间 + 具体日期）
 * 例如：2小时前 (1月17日)
 */
export function formatFriendlyTime(isoString: string | null | undefined): string {
  const date = parseDate(isoString);
  if (!date || isNaN(date.getTime())) return '-';
  
  const relative = formatRelativeTime(isoString);
  const dateStr = date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
  
  return `${relative} (${dateStr})`;
}
