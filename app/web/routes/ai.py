"""
AI 路由
处理 AI 相关功能，如文件名分析、标签提取等
"""
import json
import asyncio
import uuid
from typing import List, Optional, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, Library, FilenamePattern, Tag, User
from app.web.routes.auth import get_current_admin, get_current_user
from app.utils.logger import log
from app.utils.filename_analyzer import analyze_filename_with_ai
from app.core.ai.service import ai_service

router = APIRouter()

# ===== 内存任务存储 =====
# 注意：生产环境建议使用 Redis 或数据库
# 结构: task_id -> TaskInfo
analysis_tasks: Dict[str, dict] = {}

# ===== Pydantic 模型 =====

class FilenameAnalysisRequest(BaseModel):
    """文件名分析请求"""
    filenames: List[str]
    library_id: Optional[int] = None
    provider: str = "openai"  # openai, anthropic, ollama
    model: Optional[str] = None

class FilenameAnalysisResult(BaseModel):
    """文件名分析结果"""
    original: str
    title: str
    author: Optional[str] = None
    extra: Optional[str] = None
    tags: List[str] = []
    confidence: float

class BatchAnalysisResponse(BaseModel):
    """批量分析响应（同步）"""
    results: List[FilenameAnalysisResult]
    total: int
    success: int
    failed: int

class TaskResponse(BaseModel):
    """任务创建响应"""
    task_id: str
    status: str
    message: str

class TaskStatusResponse(BaseModel):
    """任务状态响应"""
    task_id: str
    status: str  # pending, running, completed, failed
    progress: float  # 0-100
    processed: int
    total: int
    results: Optional[List[FilenameAnalysisResult]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

# ===== 后台任务处理 =====

async def process_batch_analysis(
    task_id: str, 
    filenames: List[str], 
    provider: str, 
    model: Optional[str]
):
    """处理批量分析后台任务"""
    task = analysis_tasks.get(task_id)
    if not task:
        return

    task["status"] = "running"
    task["started_at"] = datetime.now()
    
    results = []
    
    try:
        total = len(filenames)
        for i, filename in enumerate(filenames):
            # 检查任务是否被取消（暂不支持，但预留逻辑）
            if task.get("status") == "cancelled":
                break
                
            try:
                # 调用 AI 分析
                prompt = f"""
                请分析以下小说文件名，提取书名、作者和额外信息。
                文件名：{filename}
                
                请返回 JSON 格式：
                {{
                    "title": "书名",
                    "author": "作者(如果没有则为null)",
                    "extra": "额外信息(如卷数、状态等，没有则为null)",
                    "tags": ["标签1", "标签2"]
                }}
                只返回 JSON，不要其他内容。
                """
                
                response = await ai_service.generate_completion(
                    prompt=prompt,
                    provider=provider,
                    model=model
                )
                
                # 解析 JSON
                try:
                    # 尝试找到 JSON 部分
                    start = response.find('{')
                    end = response.rfind('}') + 1
                    if start >= 0 and end > start:
                        json_str = response[start:end]
                        data = json.loads(json_str)
                        
                        results.append({
                            "original": filename,
                            "title": data.get("title", filename),
                            "author": data.get("author"),
                            "extra": data.get("extra"),
                            "tags": data.get("tags", []),
                            "confidence": 0.8
                        })
                    else:
                        raise ValueError("无法解析 AI 响应")
                except Exception as e:
                    log.error(f"解析 AI 响应失败: {e}, 响应: {response}")
                    results.append({
                        "original": filename,
                        "title": filename,
                        "confidence": 0.0,
                        "error": str(e)
                    })
                    
            except Exception as e:
                log.error(f"分析文件名失败: {filename}, 错误: {e}")
                results.append({
                    "original": filename,
                    "title": filename,
                    "confidence": 0.0,
                    "error": str(e)
                })
            
            # 更新进度
            task["processed"] = i + 1
            task["progress"] = ((i + 1) / total) * 100
            task["results"] = results  # 实时更新结果
            
            # 稍微延时，避免速率限制
            await asyncio.sleep(0.1)
            
        task["status"] = "completed"
        task["completed_at"] = datetime.now()
        
    except Exception as e:
        log.error(f"批量分析任务失败: {task_id}, 错误: {e}")
        task["status"] = "failed"
        task["error"] = str(e)
        task["completed_at"] = datetime.now()

# ===== 路由处理 =====

@router.post("/analyze/filenames/batch", response_model=TaskResponse)
async def analyze_filenames_batch(
    request: FilenameAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin)
):
    """
    提交批量分析任务（后台运行）
    """
    if not ai_service.is_enabled():
        raise HTTPException(status_code=400, detail="AI 服务未启用")
        
    # 限制批量大小（虽然是后台任务，但也要防止过大）
    if len(request.filenames) > 500:
        raise HTTPException(status_code=400, detail="单次请求最多支持 500 个文件名")
    
    task_id = str(uuid.uuid4())
    
    analysis_tasks[task_id] = {
        "id": task_id,
        "status": "pending",
        "filenames": request.filenames,
        "total": len(request.filenames),
        "processed": 0,
        "progress": 0.0,
        "results": [],
        "created_at": datetime.now(),
        "provider": request.provider,
        "model": request.model
    }
    
    # 启动后台任务
    background_tasks.add_task(
        process_batch_analysis,
        task_id,
        request.filenames,
        request.provider,
        request.model
    )
    
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "任务已提交"
    }

@router.get("/analyze/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_admin)
):
    """获取任务状态"""
    task = analysis_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
        
    return {
        "task_id": task["id"],
        "status": task["status"],
        "progress": task["progress"],
        "processed": task["processed"],
        "total": task["total"],
        "results": task["results"],
        "created_at": task["created_at"],
        "completed_at": task.get("completed_at"),
        "error": task.get("error")
    }

@router.get("/analyze/tasks", response_model=List[TaskStatusResponse])
async def list_tasks(
    status: Optional[str] = None,
    limit: int = 10,
    current_user: User = Depends(get_current_admin)
):
    """获取任务列表"""
    tasks = list(analysis_tasks.values())
    
    # 排序：最新的在前
    tasks.sort(key=lambda x: x["created_at"], reverse=True)
    
    if status:
        tasks = [t for t in tasks if t["status"] == status]
        
    # 分页
    tasks = tasks[:limit]
    
    # 构建响应（不返回详细结果以减少流量）
    response = []
    for task in tasks:
        response.append({
            "task_id": task["id"],
            "status": task["status"],
            "progress": task["progress"],
            "processed": task["processed"],
            "total": task["total"],
            "results": None, # 列表页不返回详细结果
            "created_at": task["created_at"],
            "completed_at": task.get("completed_at"),
            "error": task.get("error")
        })
        
    return response

@router.delete("/analyze/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_admin)
):
    """删除任务记录"""
    if task_id in analysis_tasks:
        del analysis_tasks[task_id]
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="任务不存在")

# 保留旧的同步接口以兼容
@router.post("/analyze/filenames", response_model=BatchAnalysisResponse)
async def analyze_filenames(
    request: FilenameAnalysisRequest,
    current_user: User = Depends(get_current_admin)
):
    """
    使用 AI 批量分析文件名（同步接口，建议使用 batch 接口）
    """
    if not ai_service.is_enabled():
        raise HTTPException(status_code=400, detail="AI 服务未启用")
        
    results = []
    success_count = 0
    failed_count = 0
    
    # 限制批量大小
    if len(request.filenames) > 20:
        raise HTTPException(status_code=400, detail="单次请求最多支持 20 个文件名，请分批处理")
    
    for filename in request.filenames:
        try:
            # 调用 AI 分析
            prompt = f"""
            请分析以下小说文件名，提取书名、作者和额外信息。
            文件名：{filename}
            
            请返回 JSON 格式：
            {{
                "title": "书名",
                "author": "作者(如果没有则为null)",
                "extra": "额外信息(如卷数、状态等，没有则为null)",
                "tags": ["标签1", "标签2"]
            }}
            只返回 JSON，不要其他内容。
            """
            
            response = await ai_service.generate_completion(
                prompt=prompt,
                provider=request.provider,
                model=request.model
            )
            
            # 解析 JSON
            try:
                # 尝试找到 JSON 部分
                start = response.find('{')
                end = response.rfind('}') + 1
                if start >= 0 and end > start:
                    json_str = response[start:end]
                    data = json.loads(json_str)
                    
                    results.append(FilenameAnalysisResult(
                        original=filename,
                        title=data.get("title", filename),
                        author=data.get("author"),
                        extra=data.get("extra"),
                        tags=data.get("tags", []),
                        confidence=0.8  # 模拟置信度
                    ))
                    success_count += 1
                else:
                    raise ValueError("无法解析 AI 响应")
            except Exception as e:
                log.error(f"解析 AI 响应失败: {e}, 响应: {response}")
                failed_count += 1
                results.append(FilenameAnalysisResult(
                    original=filename,
                    title=filename,
                    confidence=0.0
                ))
                
        except Exception as e:
            log.error(f"分析文件名失败: {filename}, 错误: {e}")
            failed_count += 1
            results.append(FilenameAnalysisResult(
                original=filename,
                title=filename,
                confidence=0.0
            ))
            
    return {
        "results": results,
        "total": len(request.filenames),
        "success": success_count,
        "failed": failed_count
    }

@router.get("/config")
async def get_ai_config(
    current_user: User = Depends(get_current_admin)
):
    """获取 AI 配置"""
    return {
        "enabled": ai_service.is_enabled(),
        "providers": ai_service.get_available_providers(),
        "default_provider": ai_service.default_provider,
        "models": ai_service.get_available_models()
    }
