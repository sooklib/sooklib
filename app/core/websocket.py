from typing import List, Dict, Any
from fastapi import WebSocket

class ConnectionManager:
    """WebSocket 连接管理器"""
    
    def __init__(self):
        # 活跃连接映射：user_id -> List[WebSocket]
        self.active_connections: Dict[int, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        """处理新连接"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        """处理断开连接"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
    
    async def broadcast_to_user(self, user_id: int, message: Dict[str, Any]):
        """向指定用户的所有连接广播消息"""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id][:]:
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(connection, user_id)

    async def broadcast(self, message: Dict[str, Any]):
        """广播消息给所有连接（仅用于系统通知）"""
        for user_id, connections in self.active_connections.items():
            for connection in connections[:]:
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(connection, user_id)

# 全局单例
manager = ConnectionManager()
