# Sooklib - React WebUI

基于 React + TypeScript + Material-UI 构建的小说书库 Web 前端。

## 技术栈

- **框架**: React 18 + TypeScript
- **路由**: React Router v6
- **UI 组件**: Material-UI v5
- **状态管理**: Zustand
- **HTTP 客户端**: Axios
- **阅读器**: epub.js (EPUB) + 原生实现 (TXT)
- **PWA**: vite-plugin-pwa + Workbox
- **构建工具**: Vite

## 功能特性

### 用户功能
- ✅ 登录/登出认证
- ✅ 首页仪表盘（统计、继续阅读、最新书籍）
- ✅ 书库浏览（网格/列表视图、排序、筛选）
- ✅ 书籍详情（元数据、封面、下载）
- ✅ 搜索功能（关键词搜索、搜索历史）
- ✅ 个人中心（用户信息、修改密码）

### 阅读器
- ✅ TXT 阅读器
  - 章节自动识别
  - 目录导航
  - 字体大小/行距调节
  - 4种主题（暗黑/护眼/亮色/绿色）
  - 阅读进度保存
- ✅ EPUB 阅读器
  - epub.js 渲染
  - 目录导航
  - 翻页控制
  - 主题切换

### 后台管理
- ✅ 用户管理（CRUD、密码重置、权限设置）
- ✅ 书库管理（CRUD、扫描触发）
- ✅ 备份管理（创建、下载、恢复、自动备份）
- ✅ 封面管理（统计、批量提取、清理）

### PWA 支持
- ✅ Service Worker 自动注册
- ✅ 离线缓存（静态资源）
- ✅ API 缓存策略
- ✅ 封面图片缓存
- ✅ 安装提示

## 项目结构

```
react_app/
├── public/
│   ├── manifest.json       # PWA 配置
│   └── icons/              # 应用图标
├── src/
│   ├── components/         # 通用组件
│   │   ├── BookCard.tsx
│   │   ├── ContinueReadingCard.tsx
│   │   └── admin/          # 管理后台组件
│   │       ├── UsersTab.tsx
│   │       ├── LibrariesTab.tsx
│   │       ├── BackupTab.tsx
│   │       └── CoversTab.tsx
│   ├── layouts/
│   │   └── MainLayout.tsx  # 主布局
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── LibraryPage.tsx
│   │   ├── BookDetailPage.tsx
│   │   ├── ReaderPage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── ProfilePage.tsx
│   │   └── AdminPage.tsx
│   ├── services/
│   │   └── api.ts          # Axios 配置
│   ├── stores/
│   │   ├── authStore.ts    # 认证状态
│   │   └── themeStore.ts   # 主题状态
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 开发

### 环境要求
- Node.js >= 16
- npm >= 8

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```
访问 http://localhost:3000

### 生产构建
```bash
npm run build
```
构建产物在 `dist/` 目录

### 预览构建
```bash
npm run preview
```

## 后端 API

开发时通过 Vite 代理转发 `/api` 请求到后端：

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true
    }
  }
}
```

## 部署

### 1. 构建前端
```bash
npm run build
```

### 2. 集成到 FastAPI
将 `dist/` 目录复制到后端静态文件目录：
```bash
cp -r dist/* ../app/web/static/react/
```

### 3. 配置后端路由
在 FastAPI 中添加静态文件服务和 SPA 路由回退。

## 浏览器支持

- Chrome >= 88
- Firefox >= 78
- Safari >= 14
- Edge >= 88

## 许可证

MIT
