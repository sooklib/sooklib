// TXT阅读器
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
let bookData = null;
let currentPosition = 0;
let bookmarks = [];
let settings = {
    fontSize: 18,
    theme: 'light',
    lineHeight: 1.8
};

// 从localStorage加载设置
function loadSettings() {
    const saved = localStorage.getItem('reader_settings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
    applySettings();
}

// 保存设置到localStorage
function saveSettings() {
    localStorage.setItem('reader_settings', JSON.stringify(settings));
}

// 应用设置
function applySettings() {
    const container = document.getElementById('reader-container');
    const content = document.getElementById('content');
    
    // 字体大小
    content.style.fontSize = settings.fontSize + 'px';
    document.getElementById('font-size-display').textContent = settings.fontSize + 'px';
    
    // 行距
    content.style.lineHeight = settings.lineHeight;
    document.getElementById('line-height-display').textContent = settings.lineHeight;
    
    // 主题
    const themes = {
        light: {
            bg: 'bg-gray-50',
            text: 'text-gray-900',
            bgColor: '#f9fafb',
            textColor: '#111827'
        },
        dark: {
            bg: 'bg-gray-900',
            text: 'text-gray-100',
            bgColor: '#111827',
            textColor: '#f3f4f6'
        },
        sepia: {
            bg: 'bg-yellow-50',
            text: 'text-yellow-900',
            bgColor: '#fefce8',
            textColor: '#713f12'
        }
    };
    
    const theme = themes[settings.theme] || themes.light;
    
    // 移除所有主题类
    container.classList.remove('bg-gray-50', 'bg-gray-900', 'bg-yellow-50');
    content.classList.remove('text-gray-900', 'text-gray-100', 'text-yellow-900');
    
    // 应用新主题
    container.classList.add(theme.bg);
    content.classList.add(theme.text);
    document.body.style.backgroundColor = theme.bgColor;
}

// 切换设置面板
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
}

// 改变字体大小
function changeFontSize(delta) {
    settings.fontSize = Math.max(14, Math.min(28, settings.fontSize + delta));
    applySettings();
    saveSettings();
}

// 改变主题
function changeTheme(theme) {
    settings.theme = theme;
    applySettings();
    saveSettings();
}

// 改变行距
function changeLineHeight(value) {
    settings.lineHeight = parseFloat(value);
    applySettings();
    saveSettings();
}

// 返回上一页
function goBack() {
    saveProgress();
    window.history.back();
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
        document.title = bookData.title + ' - TXT阅读器';
        
        // 加载阅读进度
        await loadProgress();
        
        // 加载书籍内容
        await loadContent();
        
    } catch (error) {
        console.error('加载书籍信息失败:', error);
        alert('加载书籍信息失败: ' + error.message);
    }
}

// 加载书籍内容
async function loadContent() {
    const token = getToken();
    
    try {
        const response = await fetch(`/api/books/${bookId}/content`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('无法加载书籍内容');
        }
        
        const data = await response.json();
        
        // 显示内容
        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = formatText(data.content);
        
        // 隐藏加载提示
        document.getElementById('loading').classList.add('hidden');
        contentDiv.classList.remove('hidden');
        
        // 恢复阅读位置
        if (currentPosition > 0) {
            window.scrollTo(0, currentPosition);
        }
        
        // 监听滚动事件
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateProgress();
                saveProgressDebounced();
            }, 200);
        });
        
    } catch (error) {
        console.error('加载书籍内容失败:', error);
        document.getElementById('loading').innerHTML = 
            '<p class="text-red-600">加载失败: ' + error.message + '</p>';
    }
}

// 格式化文本（处理段落和空行）
function formatText(text) {
    return text
        .split('\n')
        .map(line => {
            line = line.trim();
            if (line === '') {
                return '<p class="h-4"></p>'; // 空行
            }
            // 段落首行缩进
            return '<p class="mb-4 indent-8">' + escapeHtml(line) + '</p>';
        })
        .join('');
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
                currentPosition = parseInt(data.current_position);
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
    currentPosition = window.pageYOffset;
    const progress = calculateProgress();
    const token = getToken();
    
    try {
        await fetch(`/api/progress/${bookId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_position: currentPosition.toString(),
                progress_percentage: progress
            })
        });
    } catch (error) {
        console.error('保存阅读进度失败:', error);
    }
}

// 计算阅读进度
function calculateProgress() {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return 0;
    
    const progress = Math.round((window.pageYOffset / scrollHeight) * 100);
    return Math.max(0, Math.min(100, progress));
}

// 更新进度显示
function updateProgress() {
    const progress = calculateProgress();
    document.getElementById('progress-text').textContent = progress + '%';
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case 'Escape':
            goBack();
            break;
        case 'ArrowUp':
        case 'PageUp':
            window.scrollBy(0, -window.innerHeight * 0.8);
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 'PageDown':
            window.scrollBy(0, window.innerHeight * 0.8);
            e.preventDefault();
            break;
        case '+':
        case '=':
            if (e.ctrlKey || e.metaKey) {
                changeFontSize(2);
                e.preventDefault();
            }
            break;
        case '-':
            if (e.ctrlKey || e.metaKey) {
                changeFontSize(-2);
                e.preventDefault();
            }
            break;
    }
});

// 页面关闭前保存进度
window.addEventListener('beforeunload', () => {
    saveProgress();
});

// 点击外部关闭设置面板
document.addEventListener('click', (e) => {
    const panel = document.getElementById('settings-panel');
    if (!panel.contains(e.target) && 
        !e.target.closest('button[onclick="toggleSettings()"]')) {
        panel.classList.add('hidden');
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
                            ${bookmark.chapter_title || '位置 ' + Math.round(parseInt(bookmark.position) / 100)}
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
    
    // 关闭设置面板
    settingsPanel.classList.add('hidden');
    
    // 切换书签面板
    panel.classList.toggle('hidden');
    
    // 如果打开，加载书签
    if (!panel.classList.contains('hidden')) {
        loadBookmarks();
    }
}

// 添加书签（打开对话框）
function addBookmark() {
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
    const note = document.getElementById('bookmark-note').value.trim();
    const position = window.pageYOffset;
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
                position: position.toString(),
                note: note || null
            })
        });
        
        if (response.ok) {
            closeBookmarkDialog();
            loadBookmarks();
            // 显示成功提示
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
function gotoBookmark(bookmarkId, position) {
    const pos = parseInt(position);
    window.scrollTo({
        top: pos,
        behavior: 'smooth'
    });
    
    // 关闭书签面板
    document.getElementById('bookmarks-panel').classList.add('hidden');
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

// 点击外部关闭书签面板
document.addEventListener('click', (e) => {
    const bookmarksPanel = document.getElementById('bookmarks-panel');
    if (!bookmarksPanel.contains(e.target) && 
        !e.target.closest('button[onclick="toggleBookmarks()"]')) {
        bookmarksPanel.classList.add('hidden');
    }
    
    // 点击外部关闭对话框
    const dialog = document.getElementById('bookmark-dialog');
    if (e.target === dialog) {
        closeBookmarkDialog();
    }
});

// 初始化
loadSettings();
loadBookInfo();
