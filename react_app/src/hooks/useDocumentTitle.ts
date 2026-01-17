import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * 设置页面文档标题的 Hook
 * 格式: "{服务器名称} - {页面标题}"
 * 
 * @param pageTitle 页面标题，传空字符串则只显示服务器名称
 */
export function useDocumentTitle(pageTitle: string) {
  const serverName = useSettingsStore((state) => state.serverName)
  
  useEffect(() => {
    const title = pageTitle 
      ? `${serverName} - ${pageTitle}`
      : serverName
    
    document.title = title
    
    // 组件卸载时恢复默认标题
    return () => {
      document.title = serverName
    }
  }, [serverName, pageTitle])
}

/**
 * 获取完整的文档标题
 * @param pageTitle 页面标题
 * @returns 完整标题
 */
export function getDocumentTitle(serverName: string, pageTitle: string): string {
  return pageTitle ? `${serverName} - ${pageTitle}` : serverName
}
