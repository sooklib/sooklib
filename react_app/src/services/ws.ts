import { useAuthStore } from '../stores/authStore';

type MessageHandler = (data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: { [key: string]: MessageHandler[] } = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting: boolean = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 监听 auth store 变化，如果 token 改变（例如注销），断开连接
    useAuthStore.subscribe((state, prevState) => {
      if (state.token && !prevState.token) {
        this.connect();
      } else if (!state.token && prevState.token) {
        this.disconnect();
      }
    });
  }

  public connect() {
    const token = useAuthStore.getState().token;
    if (!token) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 在开发环境中，vite 代理会处理 /ws，但在生产环境中需要完整 URL
    // 假设后端和前端在同一域名下，或者是开发环境代理
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?token=${token}`;

    console.log('正在连接 WebSocket...', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket 已连接');
        this.isConnecting = false;
        this.startHeartbeat();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        
        try {
          const data = JSON.parse(event.data);
          this.dispatch(data);
        } catch (e) {
          console.error('无法解析 WebSocket 消息:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket 已断开');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.ws = null;
        // 尝试重连
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        this.isConnecting = false;
        this.ws?.close();
      };

    } catch (e) {
      console.error('WebSocket 连接创建失败:', e);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.isConnecting = false;
  }

  public on(type: string, handler: MessageHandler) {
    if (!this.handlers[type]) {
      this.handlers[type] = [];
    }
    this.handlers[type].push(handler);
  }

  public off(type: string, handler: MessageHandler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(h => h !== handler);
  }

  private dispatch(data: any) {
    const type = data.type;
    if (type && this.handlers[type]) {
      this.handlers[type].forEach(handler => handler(data));
    }
  }

  private scheduleReconnect() {
    if (!useAuthStore.getState().token) return;
    if (this.reconnectTimer) return;

    console.log('将在 5 秒后尝试重连 WebSocket...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 30000); // 每 30 秒发送一次心跳
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export const wsService = new WebSocketService();
