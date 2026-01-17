from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.websocket import manager
from app.database import get_db
from app.security import decode_access_token
from app.models import User
from sqlalchemy import select
from app.utils.logger import log

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(None),
    db: AsyncSession = Depends(get_db)
):
    user = None
    if token:
        try:
            payload = decode_access_token(token)
            username = payload.get("sub")
            if username:
                result = await db.execute(select(User).where(User.username == username))
                user = result.scalar_one_or_none()
        except Exception as e:
            log.error(f"WebSocket 认证失败: {e}")
            pass
    
    if not user:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user.id)
    try:
        while True:
            # 保持连接活跃，并可以接收客户端消息（如果有的话）
            # 目前主要用于服务器向客户端推送消息
            data = await websocket.receive_text()
            # 可以在这里处理客户端发送的消息，如果需要
            # 例如：接收心跳以保持连接
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id)
    except Exception as e:
        log.error(f"WebSocket 错误: {e}")
        manager.disconnect(websocket, user.id)
