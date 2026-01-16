// EPUB阅读器
const bookId = parseInt(window.location.pathname.split('/').pop());

// 从 localStorage 或 URL 参数获取 token
function getToken() {
    // 1. 尝试从 URL 参数获取
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');
    
    // 2. 尝试从 localStorage 获取
    if (!token) {
        token = localStorage.getItem('token');
    }
    
    // 3. 尝试从 Flutter 存储获取
    if (!token) {
        try {
            const flutterAuth = localStorage.getItem('flutter.auth_token');
            if (flutterAuth) {
                token = flutterAuth.replace(/"/g, '');
            }
        } catch(e) {}
    }
    
    // 如果从 URL 获取到 token，保存到 localStorage
    if (token && urlParams.get('token')) {
        localStorage.setItem('token', token);
    }
    
    return token;
}

// 阅读器状态
let book = null;
let rendition = null;
let bookData = null;
let currentCfi = null;
let bookmarks = [];
let settings = {
    fontSize: 100,
    theme: 'light'
};

// 从localStorage加载设置
function loadSettings() {
    const saved = localStorage.getItem('epub_reader_settings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
}

// 保存设置到localStorage
function saveSettings() {
    localStorage.setItem('epub_reader_settings', JSON.stringify(settings));
}

// 应用设置
function applySettings() {
    if (!rendition) return;
    
    // 字体大小
    rendition.themes.fontSize(settings.fontSize + '%');
    document.getElementById('font-size-display').textContent = settings.fontSize + '%';
    
    // 主题
    const themes = {
        light: {
            body: { 'background': '#f9fafb', 'color': '#111827' }
        },
        dark: {
            body: { 'background': '#111827', 'color': '#f3f4f6' }
        },
        sepia: {
            body: { 'background': '#fefce8', 'color': '#713f12' }
        }
    };
    
    const theme = themes[settings.theme] || themes.light;
    rendition.themes.register('custom', theme);
    rendition.themes.select('custom');
}

// 切换设置面板
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
    // 关闭目录
    document.getElementById('toc-panel').classList.add('hidden');
}

// 切换目录面板
function toggleToc() {
    const panel = document.getElementById('toc-panel');
    panel.classList.toggle('hidden');
    // 关闭设置
    document.getElementById('settings-panel').classList.add('hidden');
}

// 改变字体大小
function changeFontSize(delta) {
    settings.fontSize = Math.max(80, Math.min(150, settings.fontSize + delta));
    applySettings();
    saveSettings();
}

// 改变主题
function changeTheme(theme) {
    settings.theme = theme;
    applySettings();
    saveSettings();
}

// 返回上一页
function goBack() {
    saveProgress();
    window.history.back();
}

// 上一页
function prevPage() {
    if (rendition) {
        rendition.prev();
    }
}

// 下一页
function nextPage() {
    if (rendition) {
        rendition.next();
    }
}

// 加载书籍信息
async function loadBookInfo() {
    const token = getToken();
    if (!token) {
        alert('未登录，请先登录后再试。');
        window.history.back();
        return;
    }
    
    try {
        const response = await fetch(`/api/books/${bookId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('无法加载书籍信息');
        }
        
        bookData = await response.json();
        document.getElementById('book-title').textContent = bookData.title;
        document.title = bookData.title + ' - EPUB阅读器';
        
        // 加载阅读进度
        await loadProgress();
        
        // 加载EPUB
        await loadEpub();
        
    } catch (error) {
        console.error('加载书籍信息失败:', error);
        alert('加载书籍信息失败: ' + error.message);
    }
}

// 加载EPUB
async function loadEpub() {
    try {
        // 获取EPUB文件URL
        const epubUrl = `/api/books/${bookId}/content`;
        
        const token = getToken();
        
        // 创建EPUB.js实例
        book = ePub(epubUrl, {
            requestHeaders: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // 创建渲染器
        rendition = book.renderTo('epub-viewer', {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated'
        });
        
        // 应用设置
        applySettings();
        
        // 显示书籍
        if (currentCfi) {
            await rendition.display(currentCfi);
        } else {
            await rendition.display();
        }
        
        // 隐藏加载提示，显示阅读器
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('epub-viewer').classList.remove('hidden');
        document.getElementById('nav-buttons').classList.remove('hidden');
        
        // 加载目录
        await loadToc();
        
        // 监听位置变化
        rendition.on('relocated', (location) => {
            currentCfi = location.start.cfi;
            updateProgress(location);
            saveProgressDebounced();
            updateChapterTitle(location);
        });
        
        // 键盘快捷键
        rendition.on('keyup', handleKeyPress);
        
        // 点击翻页
        rendition.on('click', (event) => {
            const rect = event.target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const width = rect.width;
            
            if (x < width / 3) {
                prevPage();
            } else if (x > width * 2 / 3) {
                nextPage();
            }
        });
        
    } catch (error) {
        console.error('加载EPUB失败:', error);
        document.getElementById('loading').innerHTML = 
            '<p class="text-red-600">加载失败: ' + error.message + '</p>';
    }
}

// 加载目录
async function loadToc() {
    try {
        const navigation = await book.loaded.navigation;
        const toc = navigation.toc;
        
        const tocContent = document.getElementById('toc-content');
        tocContent.innerHTML = renderTocItems(toc);
        
    } catch (error) {
        console.error('加载目录失败:', error);
    }
}

// 渲染目录项
function renderTocItems(items, level = 0) {
    return items.map(item => {
        const indent = level * 16;
        let html = `
            <div class="toc-item" style="padding-left: ${indent}px" onclick="goToChapter('${item.href}')">
                ${escapeHtml(item.label)}
            </div>
        `;
        
        if (item.subitems && item.subitems.length > 0) {
            html += renderTocItems(item.subitems, level + 1);
        }
        
        return html;
    }).join('');
}

// 跳转到章节
function goToChapter(href) {
    if (rendition) {
        rendition.display(href);
        toggleToc();
    }
}

// 更新章节标题
function updateChapterTitle(location) {
    if (!book || !book.navigation) return;
    
    book.loaded.navigation.then(nav => {
        const chapter = nav.get(location.start.href);
        if (chapter) {
            document.getElementById('chapter-title').textContent = chapter.label;
        }
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 加载阅读进度
async function loadProgress() {
    const token = getToken();
    
    try {
        const response = await fetch(`/api/progress/${bookId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.current_position) {
                currentCfi = data.current_position;
            }
        }
    } catch (error) {
        console.error('加载阅读进度失败:', error);
    }
}

// 保存阅读进度（防抖）
let saveProgressTimeout;
function saveProgressDebounced() {
    clearTimeout(saveProgressTimeout);
    saveProgressTimeout = setTimeout(() => {
        saveProgress();
    }, 2000);
}

// 保存阅读进度
async function saveProgress() {
    if (!currentCfi) return;
    
    const token = getToken();
    
    try {
        // 计算进度百分比
        const progress = await calculateProgress();
        
        await fetch(`/api/progress/${bookId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_position: currentCfi,
                progress_percentage: progress
            })
        });
    } catch (error) {
        console.error('保存阅读进度失败:', error);
    }
}

// 计算阅读进度
async function calculateProgress() {
    if (!book || !rendition) return 0;
    
    try {
        const location = rendition.currentLocation();
        if (location && location.start) {
            const percentage = book.locations.percentageFromCfi(location.start.cfi);
            return Math.round(percentage * 100);
        }
    } catch (error) {
        console.error('计算进度失败:', error);
    }
    
    return 0;
}

// 更新进度显示
async function updateProgress(location) {
    try {
        const percentage = book.locations.percentageFromCfi(location.start.cfi);
        const progress = Math.round(percentage * 100);
        document.getElementById('progress-text').textContent = progress + '%';
    } catch (error) {
        // 忽略错误
    }
}

// 键盘快捷键处理
function handleKeyPress(event) {
    switch(event.key) {
        case 'Escape':
            goBack();
            break;
        case 'ArrowLeft':
            prevPage();
            event.preventDefault();
            break;
        case 'ArrowRight':
            nextPage();
            event.preventDefault();
            break;
    }
}

// 页面关闭前保存进度
window.addEventListener('beforeunload', () => {
    saveProgress();
});

// 点击外部关闭面板
document.addEventListener('click', (e) => {
    const settingsPanel = document.getElementById('settings-panel');
    const tocPanel = document.getElementById('toc-panel');
    
    if (!settingsPanel.contains(e.target) && 
        !e.target.closest('button[onclick="toggleSettings()"]')) {
        settingsPanel.classList.add('hidden');
    }
    
    if (!tocPanel.contains(e.target) && 
        !e.target.closest('button[onclick="toggleToc()"]')) {
        tocPanel.classList.add('hidden');
    }
});

// ===== 书签功能 =====

// 加载书签列表
async function loadBookmarks() {
    const token = getToken();
    
    try {
        const response = await fetch(`/api/books/${bookId}/bookmarks`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            bookmarks = await response.json();
            renderBookmarksList();
        }
    } catch (error) {
        console.error('加载书签失败:', error);
    }
}

// 渲染书签列表
function renderBookmarksList() {
    const listDiv = document.getElementById('bookmarks-list');
    
    if (bookmarks.length === 0) {
        listDiv.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">暂无书签</p>';
        return;
    }
    
    listDiv.innerHTML = bookmarks.map(bookmark => `
        <div class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer group relative">
            <div onclick="gotoBookmark(${bookmark.id}, '${bookmark.position}')">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="text-sm font-medium text-gray-900">
                            ${bookmark.chapter_title || '书签位置'}
                        </div>
                        ${bookmark.note ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(bookmark.note)}</div>` : ''}
                        <div class="text-xs text-gray-400 mt-1">
                            ${new Date(bookmark.created_at).toLocaleString('zh-CN')}
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); deleteBookmark(${bookmark.id})" 
                            class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// 切换书签面板
function toggleBookmarks() {
    const panel = document.getElementById('bookmarks-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const tocPanel = document.getElementById('toc-panel');
    
    // 关闭其他面板
    settingsPanel.classList.add('hidden');
    tocPanel.classList.add('hidden');
    
    // 切换书签面板
    panel.classList.toggle('hidden');
    
    // 如果打开，加载书签
    if (!panel.classList.contains('hidden')) {
        loadBookmarks();
    }
}

// 添加书签（打开对话框）
async function addBookmark() {
    if (!currentCfi) {
        alert('请先加载书籍');
        return;
    }
    
    // 获取当前章节标题
    let chapterTitle = '';
    try {
        const location = rendition.currentLocation();
        if (book && book.navigation) {
            const nav = await book.loaded.navigation;
            const chapter = nav.get(location.start.href);
            if (chapter) {
                chapterTitle = chapter.label;
            }
        }
    } catch (error) {
        console.error('获取章节标题失败:', error);
    }
    
    // 保存章节标题以便稍后使用
    window.tempChapterTitle = chapterTitle;
    
    const dialog = document.getElementById('bookmark-dialog');
    const noteInput = document.getElementById('bookmark-note');
    noteInput.value = '';
    dialog.classList.remove('hidden');
}

// 关闭书签对话框
function closeBookmarkDialog() {
    const dialog = document.getElementById('bookmark-dialog');
    dialog.classList.add('hidden');
}

// 保存书签
async function saveBookmark() {
    if (!currentCfi) {
        alert('无法保存书签');
        return;
    }
    
    const note = document.getElementById('bookmark-note').value.trim();
    const chapterTitle = window.tempChapterTitle || '';
    const token = getToken();
    
    try {
        const response = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                book_id: bookId,
                position: currentCfi,
                chapter_title: chapterTitle || null,
                note: note || null
            })
        });
        
        if (response.ok) {
            closeBookmarkDialog();
            loadBookmarks();
            showNotification('书签已添加');
        } else {
            throw new Error('添加书签失败');
        }
    } catch (error) {
        console.error('保存书签失败:', error);
        alert('保存书签失败: ' + error.message);
    }
}

// 跳转到书签
function gotoBookmark(bookmarkId, cfi) {
    if (rendition) {
        rendition.display(cfi);
        // 关闭书签面板
        document.getElementById('bookmarks-panel').classList.add('hidden');
    }
}

// 删除书签
async function deleteBookmark(bookmarkId) {
    if (!confirm('确定要删除这个书签吗？')) {
        return;
    }
    
    const token = getToken();
    
    try {
        const response = await fetch(`/api/bookmarks/${bookmarkId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            loadBookmarks();
            showNotification('书签已删除');
        } else {
            throw new Error('删除书签失败');
        }
    } catch (error) {
        console.error('删除书签失败:', error);
        alert('删除书签失败: ' + error.message);
    }
}

// 显示通知
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 2000);
}

// 更新键盘快捷键以支持书签
document.addEventListener('keydown', (e) => {
    // Ctrl+D / Cmd+D: 添加书签
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        addBookmark();
    }
    
    // Ctrl+B / Cmd+B: 打开书签面板
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleBookmarks();
    }
});

// 点击外部关闭书签面板和对话框
document.addEventListener('click', (e) => {
    const bookmarksPanel = document.getElementById('bookmarks-panel');
    if (bookmarksPanel && !bookmarksPanel.contains(e.target) && 
        !e.target.closest('button[onclick="toggleBookmarks()"]')) {
        bookmarksPanel.classList.add('hidden');
    }
    
    // 点击外部关闭对话框
    const dialog = document.getElementById('bookmark-dialog');
    if (dialog && e.target === dialog) {
        closeBookmarkDialog();
    }
});

// 初始化
loadSettings();
loadBookInfo();
