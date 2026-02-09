"""
书库多路径和后台扫描管理 API
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Library, LibraryPath, ScanTask, User
from app.web.routes.auth import get_current_user
from app.core.background_scanner import get_background_scanner
from app.utils.logger import log


router = APIRouter()


# ==================== Pydantic Models ====================

class PathCreate(BaseModel):
    """添加路径请求"""
    path: str


class PathResponse(BaseModel):
    """路径响应"""
    id: int
    path: str
    enabled: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class LibraryCreateMultiPath(BaseModel):
    """创建多路径书库请求"""
    name: str
    paths: List[str]
    is_public: bool = False


class ScanTaskResponse(BaseModel):
    """扫描任务响应"""
    id: int
    library_id: int
    status: str
    progress: int
    total_files: int
    processed_files: int
    added_books: int
    skipped_books: int
    error_count: int
    error_message: Optional[str]
    error_details: Optional[List[dict]] = None
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 权限检查 ====================

def admin_required(current_user: User = Depends(get_current_user)):
    """要求管理员权限"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


# ==================== 路径管理 API ====================

@router.post("/admin/libraries/{library_id}/paths", response_model=PathResponse)
async def add_library_path(
    library_id: int,
    path_data: PathCreate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    为书库添加新路径
    """
    from pathlib import Path
    
    # 验证书库存在
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    # 路径规范化（不强制要求路径存在，因为可能在远程挂载等情况）
    path_str = path_data.path.strip()
    
    # 基本验证
    if not path_str:
        raise HTTPException(status_code=400, detail="路径不能为空")
    
    if len(path_str) > 500:
        raise HTTPException(status_code=400, detail="路径长度不能超过500个字符")
    
    log.info(f"尝试添加路径: '{path_str}' (长度: {len(path_str)})")
    
    # 检查路径是否已存在
    existing = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.library_id == library_id)
        .where(LibraryPath.path == path_str)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="路径已存在")
    
    # 创建新路径
    try:
        lib_path = LibraryPath(
            library_id=library_id,
            path=path_str,
            enabled=True
        )
        
        db.add(lib_path)
        await db.commit()
        await db.refresh(lib_path)
        
        log.info(f"管理员 {current_user.username} 为书库 {library.name} 成功添加路径: {path_str}")
        
        return lib_path
        
    except Exception as e:
        await db.rollback()
        log.error(f"添加路径失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"添加路径失败: {str(e)}")


@router.get("/admin/libraries/{library_id}/paths", response_model=List[PathResponse])
async def list_library_paths(
    library_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书库的所有路径
    """
    # 验证书库存在
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    # 获取所有路径
    result = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.library_id == library_id)
        .order_by(LibraryPath.created_at)
    )
    paths = result.scalars().all()
    
    return paths


class PathUpdate(BaseModel):
    """更新路径请求"""
    path: str


@router.put("/admin/libraries/{library_id}/paths/{path_id}", response_model=PathResponse)
async def update_library_path(
    library_id: int,
    path_id: int,
    path_data: PathUpdate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新书库路径
    """
    # 获取路径
    result = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.id == path_id)
        .where(LibraryPath.library_id == library_id)
    )
    path = result.scalar_one_or_none()
    
    if not path:
        raise HTTPException(status_code=404, detail="路径不存在")
    
    # 验证新路径
    new_path = path_data.path.strip()
    if not new_path:
        raise HTTPException(status_code=400, detail="路径不能为空")
    
    if len(new_path) > 500:
        raise HTTPException(status_code=400, detail="路径长度不能超过500个字符")
    
    # 检查新路径是否与其他路径冲突
    existing = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.library_id == library_id)
        .where(LibraryPath.path == new_path)
        .where(LibraryPath.id != path_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该路径已存在")
    
    old_path = path.path
    path.path = new_path
    await db.commit()
    await db.refresh(path)
    
    log.info(f"管理员 {current_user.username} 更新了书库路径: {old_path} -> {new_path}")
    
    return path


@router.delete("/admin/libraries/{library_id}/paths/{path_id}")
async def remove_library_path(
    library_id: int,
    path_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除书库路径
    """
    # 获取路径
    result = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.id == path_id)
        .where(LibraryPath.library_id == library_id)
    )
    path = result.scalar_one_or_none()
    
    if not path:
        raise HTTPException(status_code=404, detail="路径不存在")
    
    # 检查是否是最后一个路径
    count_result = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.library_id == library_id)
    )
    paths_count = len(count_result.scalars().all())
    
    if paths_count <= 1:
        raise HTTPException(status_code=400, detail="不能删除最后一个路径")
    
    path_str = path.path
    await db.delete(path)
    await db.commit()
    
    log.info(f"管理员 {current_user.username} 删除了书库路径: {path_str}")
    
    return {"message": "路径已删除", "path": path_str}


@router.put("/admin/libraries/{library_id}/paths/{path_id}/toggle")
async def toggle_library_path(
    library_id: int,
    path_id: int,
    enabled: bool,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    启用/禁用书库路径
    """
    # 获取路径
    result = await db.execute(
        select(LibraryPath)
        .where(LibraryPath.id == path_id)
        .where(LibraryPath.library_id == library_id)
    )
    path = result.scalar_one_or_none()
    
    if not path:
        raise HTTPException(status_code=404, detail="路径不存在")
    
    # 如果是禁用，检查是否还有其他启用的路径
    if not enabled:
        enabled_result = await db.execute(
            select(LibraryPath)
            .where(LibraryPath.library_id == library_id)
            .where(LibraryPath.enabled == True)
            .where(LibraryPath.id != path_id)
        )
        if not enabled_result.scalars().first():
            raise HTTPException(status_code=400, detail="至少需要保留一个启用的路径")
    
    path.enabled = enabled
    await db.commit()
    
    log.info(
        f"管理员 {current_user.username} "
        f"{'启用' if enabled else '禁用'}了书库路径: {path.path}"
    )
    
    return {
        "message": f"路径已{'启用' if enabled else '禁用'}",
        "path_id": path_id,
        "enabled": enabled
    }


# ==================== 后台扫描 API ====================

@router.post("/admin/libraries/{library_id}/scan")
async def start_library_scan(
    library_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    启动书库后台扫描
    """
    # 验证书库存在
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    # 启动扫描
    scanner = get_background_scanner()
    
    try:
        task_id = await scanner.start_scan(library_id)
        
        log.info(
            f"管理员 {current_user.username} 启动了书库 {library.name} 的扫描任务，"
            f"任务ID: {task_id}"
        )
        
        return {
            "message": "扫描任务已启动",
            "task_id": task_id,
            "library_id": library_id,
            "library_name": library.name
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"启动扫描任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动扫描失败: {str(e)}")


@router.get("/admin/scan-tasks/stats")
async def get_scan_tasks_stats(
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取扫描任务统计信息
    """
    from sqlalchemy import func
    
    # 总任务数
    total_result = await db.execute(select(func.count(ScanTask.id)))
    total_tasks = total_result.scalar()
    
    # 按状态统计
    stats_by_status = {}
    for status in ['pending', 'running', 'completed', 'failed', 'cancelled']:
        result = await db.execute(
            select(func.count(ScanTask.id)).where(ScanTask.status == status)
        )
        stats_by_status[status] = result.scalar()
    
    # 总添加书籍数
    added_result = await db.execute(select(func.sum(ScanTask.added_books)))
    total_added = added_result.scalar() or 0
    
    # 总跳过书籍数
    skipped_result = await db.execute(select(func.sum(ScanTask.skipped_books)))
    total_skipped = skipped_result.scalar() or 0
    
    # 总错误数
    error_result = await db.execute(select(func.sum(ScanTask.error_count)))
    total_errors = error_result.scalar() or 0
    
    return {
        "total_tasks": total_tasks,
        "by_status": stats_by_status,
        "totals": {
            "added_books": total_added,
            "skipped_books": total_skipped,
            "errors": total_errors
        }
    }


@router.get("/admin/scan-tasks/{task_id}")
async def get_scan_task_status(
    task_id: int,
    current_user: User = Depends(admin_required)
):
    """
    获取扫描任务状态
    """
    scanner = get_background_scanner()
    
    try:
        status = await scanner.get_task_status(task_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"获取任务状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取任务状态失败: {str(e)}")


@router.get("/admin/libraries/{library_id}/scan-tasks", response_model=List[ScanTaskResponse])
async def get_library_scan_tasks(
    library_id: int,
    limit: int = 10,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书库的扫描任务历史
    """
    # 验证书库存在
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    import json
    
    # 获取任务列表
    result = await db.execute(
        select(ScanTask)
        .where(ScanTask.library_id == library_id)
        .order_by(ScanTask.created_at.desc())
        .limit(limit)
    )
    tasks = result.scalars().all()
    
    # 手动处理 error_message 中的 JSON 数据
    response = []
    for task in tasks:
        error_details = None
        if task.error_message and (task.error_message.startswith('[') or task.error_message.startswith('{')):
            try:
                error_details = json.loads(task.error_message)
            except:
                pass
        
        # 构建响应字典，然后转换为 Pydantic 模型
        task_dict = {
            "id": task.id,
            "library_id": task.library_id,
            "status": task.status,
            "progress": task.progress,
            "total_files": task.total_files,
            "processed_files": task.processed_files,
            "added_books": task.added_books,
            "skipped_books": task.skipped_books,
            "error_count": task.error_count,
            "error_message": task.error_message,
            "error_details": error_details if isinstance(error_details, list) else None,
            "started_at": task.started_at,
            "completed_at": task.completed_at,
            "created_at": task.created_at
        }
        response.append(ScanTaskResponse(**task_dict))
    
    return response


@router.post("/admin/scan-tasks/{task_id}/cancel")
async def cancel_scan_task(
    task_id: int,
    current_user: User = Depends(admin_required)
):
    """
    取消正在运行的扫描任务
    
    注意：这只是将任务标记为已取消，实际的扫描工作线程可能需要一些时间才能停止
    """
    scanner = get_background_scanner()
    
    try:
        success = await scanner.cancel_task(task_id)
        
        if not success:
            raise HTTPException(status_code=400, detail="任务不存在或无法取消")
        
        log.info(f"管理员 {current_user.username} 取消了扫描任务 {task_id}")
        
        return {
            "message": "任务已标记为取消",
            "task_id": task_id,
            "note": "实际扫描工作可能需要一些时间才能完全停止"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"取消任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"取消任务失败: {str(e)}")


@router.get("/admin/scan-tasks")
async def list_all_scan_tasks(
    status: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有扫描任务（支持按状态筛选）
    
    参数：
    - status: 可选，任务状态筛选 (pending, running, completed, failed, cancelled)
    - limit: 返回数量限制，默认50
    """
    query = select(ScanTask)
    
    if status:
        query = query.where(ScanTask.status == status)
    
    query = query.order_by(ScanTask.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    # 获取书库名称
    response = []
    for task in tasks:
        lib_result = await db.execute(
            select(Library).where(Library.id == task.library_id)
        )
        library = lib_result.scalar_one_or_none()
        
        response.append({
            "id": task.id,
            "library_id": task.library_id,
            "library_name": library.name if library else "未知",
            "status": task.status,
            "progress": task.progress,
            "total_files": task.total_files,
            "processed_files": task.processed_files,
            "added_books": task.added_books,
            "skipped_books": task.skipped_books,
            "error_count": task.error_count,
            "error_message": task.error_message,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "created_at": task.created_at.isoformat()
        })
    
    return response


