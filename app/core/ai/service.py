"""
AI 服务模块
提供与AI API的交互功能
"""
import httpx
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from app.core.ai.config import ai_config
from app.utils.logger import log


@dataclass
class AIResponse:
    """AI响应"""
    success: bool
    content: Optional[str] = None
    error: Optional[str] = None
    usage: Optional[Dict[str, int]] = None  # token使用量


class AIService:
    """AI服务"""
    
    def __init__(self):
        self.config = ai_config

    def _extract_json_block(self, content: str) -> Optional[dict]:
        text = (content or "").strip()
        if not text:
            return None

        if "BEGIN_JSON" in text and "END_JSON" in text:
            text = text.split("BEGIN_JSON", 1)[1].split("END_JSON", 1)[0].strip()

        if text.startswith('```'):
            parts = text.split('```')
            if len(parts) >= 2:
                text = parts[1].strip()
                if text.startswith('json'):
                    text = text[4:].strip()

        start = text.find('{')
        end = text.rfind('}')
        if start >= 0 and end > start:
            text = text[start:end + 1]
        else:
            return None

        try:
            import json
            return json.loads(text)
        except Exception:
            return None
    
    async def _call_openai(self, messages: List[Dict[str, str]], **kwargs) -> AIResponse:
        """调用OpenAI API"""
        provider = self.config.provider
        
        url = provider.api_base or "https://api.openai.com/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json",
            **provider.custom_headers
        }
        
        data = {
            "model": provider.model,
            "messages": messages,
            "max_tokens": kwargs.get('max_tokens', provider.max_tokens),
            "temperature": kwargs.get('temperature', provider.temperature),
        }
        
        try:
            async with httpx.AsyncClient(timeout=provider.timeout) as client:
                response = await client.post(url, json=data, headers=headers)
                response.raise_for_status()
                result = response.json()
                
                content = result['choices'][0]['message']['content']
                usage = result.get('usage')
                
                # 检查空响应
                if not content or content.strip() == "":
                    log.warning(f"AI返回空响应: {result}")
                    return AIResponse(
                        success=False, 
                        error="AI返回空响应，可能是prompt过长或模型不支持此任务"
                    )
                
                return AIResponse(
                    success=True,
                    content=content,
                    usage=usage
                )
                
        except httpx.TimeoutException:
            return AIResponse(success=False, error="请求超时")
        except httpx.HTTPStatusError as e:
            error_detail = ""
            try:
                error_body = e.response.json()
                error_detail = error_body.get("error", {}).get("message", str(e.response.text))
            except:
                error_detail = str(e.response.text)[:200]
            return AIResponse(success=False, error=f"HTTP错误 {e.response.status_code}: {error_detail}")
        except Exception as e:
            log.error(f"OpenAI API调用失败: {e}")
            return AIResponse(success=False, error=str(e))
    
    async def _call_claude(self, messages: List[Dict[str, str]], **kwargs) -> AIResponse:
        """调用Claude API"""
        provider = self.config.provider
        
        url = provider.api_base or "https://api.anthropic.com/v1/messages"
        
        headers = {
            "x-api-key": provider.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
            **provider.custom_headers
        }
        
        # 转换消息格式
        claude_messages = []
        system_prompt = None
        for msg in messages:
            if msg['role'] == 'system':
                system_prompt = msg['content']
            else:
                claude_messages.append({
                    'role': msg['role'],
                    'content': msg['content']
                })
        
        data = {
            "model": provider.model,
            "messages": claude_messages,
            "max_tokens": kwargs.get('max_tokens', provider.max_tokens),
        }
        
        if system_prompt:
            data["system"] = system_prompt
        
        try:
            async with httpx.AsyncClient(timeout=provider.timeout) as client:
                response = await client.post(url, json=data, headers=headers)
                response.raise_for_status()
                result = response.json()
                
                content = result['content'][0]['text']
                usage = result.get('usage')
                
                return AIResponse(
                    success=True,
                    content=content,
                    usage=usage
                )
                
        except httpx.TimeoutException:
            return AIResponse(success=False, error="请求超时")
        except httpx.HTTPStatusError as e:
            return AIResponse(success=False, error=f"HTTP错误: {e.response.status_code}")
        except Exception as e:
            log.error(f"Claude API调用失败: {e}")
            return AIResponse(success=False, error=str(e))
    
    async def _call_ollama(self, messages: List[Dict[str, str]], **kwargs) -> AIResponse:
        """调用Ollama本地模型"""
        provider = self.config.provider
        
        url = (provider.api_base or "http://localhost:11434") + "/api/chat"
        
        data = {
            "model": provider.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get('temperature', provider.temperature),
                "num_predict": kwargs.get('max_tokens', provider.max_tokens),
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=provider.timeout) as client:
                response = await client.post(url, json=data)
                response.raise_for_status()
                result = response.json()
                
                content = result['message']['content']
                
                return AIResponse(
                    success=True,
                    content=content
                )
                
        except httpx.TimeoutException:
            return AIResponse(success=False, error="请求超时")
        except Exception as e:
            log.error(f"Ollama API调用失败: {e}")
            return AIResponse(success=False, error=str(e))
    
    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> AIResponse:
        """
        发送聊天请求到AI
        
        Args:
            messages: 消息列表 [{"role": "user/system/assistant", "content": "..."}]
            **kwargs: 额外参数 (max_tokens, temperature等)
        
        Returns:
            AIResponse
        """
        if not self.config.is_enabled():
            return AIResponse(success=False, error="AI功能未启用")
        
        provider_type = self.config.provider.provider
        
        if provider_type == "openai":
            return await self._call_openai(messages, **kwargs)
        elif provider_type == "claude":
            return await self._call_claude(messages, **kwargs)
        elif provider_type == "ollama":
            return await self._call_ollama(messages, **kwargs)
        elif provider_type == "custom":
            # 自定义provider使用OpenAI兼容格式
            return await self._call_openai(messages, **kwargs)
        else:
            return AIResponse(success=False, error=f"不支持的AI提供商: {provider_type}")
    
    async def extract_metadata(self, filename: str, content_preview: str = "") -> Dict[str, Any]:
        """
        使用AI提取书籍元数据
        
        Args:
            filename: 文件名
            content_preview: 内容预览（前1000字）
        
        Returns:
            提取的元数据字典
        """
        if not self.config.features.metadata_enhancement:
            return {}
        
        prompt = f"""从下列信息提取书籍元数据，仅输出 JSON。

文件名: {filename}
内容预览: {content_preview[:500] if content_preview else '无'}

要求:
1) 仅输出 JSON，不要解释，不要 Markdown。
2) 不确定的字段写 null。
3) description 最多 200 字。

输出格式（严格一致）:
BEGIN_JSON
{{"title":"","author":null,"description":null,"genre":null,"tags":[]}}
END_JSON"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个专业的书籍元数据提取助手。只返回JSON格式数据。"},
            {"role": "user", "content": prompt}
        ])
        
        if not response.success:
            log.warning(f"AI元数据提取失败: {response.error}")
            return {}
        
        result = self._extract_json_block(response.content)
        if result is None:
            log.warning("解析AI响应失败: JSON格式不正确")
            return {}
        return result
    
    async def generate_summary(self, content: str, max_length: int = 200) -> Optional[str]:
        """
        使用AI生成书籍简介
        
        Args:
            content: 书籍内容
            max_length: 简介最大长度
        
        Returns:
            生成的简介
        """
        if not self.config.features.auto_generate_summary:
            return None
        
        prompt = f"""请根据以下书籍内容生成一段简介，不超过{max_length}字：

{content[:2000]}

要求：
1. 简洁概括主要内容
2. 不要剧透关键情节
3. 语言流畅自然"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个专业的书籍简介撰写助手。"},
            {"role": "user", "content": prompt}
        ])
        
        if response.success:
            return response.content[:max_length]
        return None
    
    async def classify_book(self, title: str, content_preview: str = "") -> Dict[str, Any]:
        """
        使用AI分类书籍
        
        Args:
            title: 书名
            content_preview: 内容预览
        
        Returns:
            分类结果
        """
        if not self.config.features.smart_classification:
            return {}
        
        prompt = f"""为下列书籍给出分类，仅输出 JSON。

书名: {title}
内容预览: {content_preview[:500] if content_preview else '无'}

要求:
1) 仅输出 JSON，不要解释，不要 Markdown。
2) 不确定的字段写 null。

输出格式（严格一致）:
BEGIN_JSON
{{"genre":"","sub_genre":null,"tags":[],"age_rating":"general","confidence":0.5}}
END_JSON"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个专业的书籍分类助手。只返回JSON格式数据。"},
            {"role": "user", "content": prompt}
        ])
        
        if not response.success:
            return {}
        
        result = self._extract_json_block(response.content)
        if result is None:
            log.warning("解析AI分类响应失败: JSON格式不正确")
            return {}
        return result
    
    async def test_connection(self) -> AIResponse:
        """
        测试AI连接
        
        Returns:
            测试结果
        """
        # 使用更大的max_tokens避免某些模型返回空响应
        response = await self.chat([
            {"role": "user", "content": "你好，请回复'连接成功'这四个字。"}
        ], max_tokens=100)
        
        # 如果成功但内容为空，返回更明确的错误
        if response.success and (not response.content or response.content.strip() == ""):
            return AIResponse(
                success=False, 
                error="AI返回空响应。可能原因：1)模型不支持此prompt 2)API配置问题 3)代理服务问题"
            )
        
        return response
    
    def _strip_extension(self, filename: str) -> str:
        """
        移除文件名的扩展名
        
        Args:
            filename: 原文件名
        
        Returns:
            不带扩展名的文件名
        """
        import os
        # 常见电子书扩展名
        known_extensions = {'.txt', '.epub', '.mobi', '.azw', '.azw3', '.pdf', '.docx', '.doc'}
        name, ext = os.path.splitext(filename)
        if ext.lower() in known_extensions:
            return name
        return filename
    
    async def analyze_filename_patterns(self, filenames: List[str], sample_size: int = None) -> Dict[str, Any]:
        """
        使用AI分析文件名模式，生成解析规则建议
        
        Args:
            filenames: 文件名列表
            sample_size: 采样数量（默认使用配置值）
        
        Returns:
            分析结果，包含建议的正则表达式规则
        """
        if not self.config.is_enabled():
            return {"success": False, "error": "AI功能未启用"}
        
        # 使用配置的采样数，如果没有指定则使用配置值
        import random
        configured_sample = sample_size or self.config.provider.sample_size or 15
        actual_sample = min(configured_sample, len(filenames))
        if len(filenames) > actual_sample:
            samples = random.sample(filenames, actual_sample)
        else:
            samples = filenames[:actual_sample]
        
        # 移除文件后缀后再发送给AI分析
        # 这样AI生成的正则不会包含后缀，匹配更准确
        samples_without_ext = [self._strip_extension(fn) for fn in samples]
        
        # 构建文件名列表，限制每个文件名长度
        truncated_samples = [fn[:60] if len(fn) > 60 else fn for fn in samples_without_ext]
        filename_list = "\n".join([f"- {fn}" for fn in truncated_samples])
        
        # 简化prompt，减少token消耗
        prompt = f"""分析以下{len(samples)}个小说文件名（已去除后缀），生成解析规则。

文件名：
{filename_list}

要求:
1) 仅输出 JSON，不要解释，不要 Markdown。
2) regex 兼容 Python re。
3) title_group=书名组，author_group=作者组。

输出格式（严格一致）:
BEGIN_JSON
{{"patterns":[{{"name":"","regex":"","title_group":1,"author_group":2}}],"analysis":""}}
END_JSON"""
        
        response = await self.chat([
            {"role": "system", "content": "只返回纯JSON，不要任何解释或markdown。"},
            {"role": "user", "content": prompt}
        ])  # 使用用户配置的max_tokens
        
        if not response.success:
            return {"success": False, "error": response.error}
        
        result = self._extract_json_block(response.content)
        if result is None:
            log.warning("解析AI响应失败: JSON格式不正确")
            return {"success": False, "error": "解析响应失败: JSON格式不正确", "raw": response.content}
        result["success"] = True
        return result
    
    async def batch_analyze_filenames(
        self, 
        filenames: List[str], 
        batch_size: int = 200,
        delay_between_batches: float = 2.0
    ) -> Dict[str, Any]:
        """
        批量分析文件名，采用少次多量原则（防止429错误）
        
        每次发送最多batch_size条文件名，让AI返回：
        1. 识别的书名、作者、额外信息
        2. 如果额外信息包含点评/推书评价，标记出来
        3. 基于这批文件名总结的识别规则
        
        Args:
            filenames: 文件名列表
            batch_size: 每批处理数量（默认200）
            delay_between_batches: 批次间延迟（秒）
        
        Returns:
            分析结果，包含所有识别的元数据和规则
        """
        import asyncio
        import json
        
        if not self.config.is_enabled():
            return {"success": False, "error": "AI功能未启用"}
        
        all_results = []
        all_patterns = []
        total_batches = (len(filenames) + batch_size - 1) // batch_size
        
        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            end = min(start + batch_size, len(filenames))
            batch = filenames[start:end]
            
            log.info(f"AI批量分析：处理第 {batch_idx + 1}/{total_batches} 批，共 {len(batch)} 个文件名")
            
            # 构建文件名列表
            filename_list = "\n".join([f"{i+1}. {fn}" for i, fn in enumerate(batch)])
            
            prompt = f"""分析以下{len(batch)}个小说文件名，提取元数据并总结规则。

文件名列表：
{filename_list}

要求:
1) 仅输出 JSON，不要解释，不要 Markdown。
2) 无法确定写 null。
3) patterns.regex 需兼容 Python re。
4) 字段含义: title=书名, author=作者, extra=系列/卷数/版本/点评等, has_review=是否含点评。

输出格式（严格一致）:
BEGIN_JSON
{{"books":[{{"filename":"","title":"","author":null,"extra":null,"has_review":false,"review_text":null}}],"patterns":[{{"name":"","regex":"","title_group":1,"author_group":2,"extra_group":0,"tag_group":0,"match_count":0}}],"batch_summary":""}}
END_JSON"""
            
            response = await self.chat([
                {"role": "system", "content": "你是专业的小说文件名解析助手。分析文件名并提取书名、作者等元数据。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ])  # 使用用户配置的 max_tokens
            
            if not response.success:
                log.error(f"批次 {batch_idx + 1} 分析失败: {response.error}")
                # 如果是429错误，等待更长时间后重试
                if "429" in str(response.error):
                    log.warning("遇到429限流，等待30秒后重试...")
                    await asyncio.sleep(30)
                    # 重试一次
                    response = await self.chat([
                        {"role": "system", "content": "你是专业的小说文件名解析助手。分析文件名并提取书名、作者等元数据。只返回JSON格式数据。"},
                        {"role": "user", "content": prompt}
                    ])  # 使用用户配置的 max_tokens
                
                if not response.success:
                    continue
            
            try:
                batch_result = self._extract_json_block(response.content)
                if batch_result is None:
                    raise ValueError("JSON格式不正确")
                
                # 收集结果
                if "books" in batch_result:
                    all_results.extend(batch_result["books"])
                if "patterns" in batch_result:
                    all_patterns.extend(batch_result["patterns"])
                
                log.info(f"批次 {batch_idx + 1} 完成：识别 {len(batch_result.get('books', []))} 本书")
                
            except Exception as e:
                log.warning(f"批次 {batch_idx + 1} 解析失败: {e}")
            
            # 批次间延迟，防止429
            if batch_idx < total_batches - 1:
                await asyncio.sleep(delay_between_batches)
        
        # 合并重复规则
        unique_patterns = {}
        for p in all_patterns:
            regex = p.get('regex', '')
            if regex in unique_patterns:
                unique_patterns[regex]['match_count'] = unique_patterns[regex].get('match_count', 0) + p.get('match_count', 1)
            else:
                unique_patterns[regex] = p
        
        return {
            "success": True,
            "total_files": len(filenames),
            "total_batches": total_batches,
            "recognized_books": all_results,
            "patterns": list(unique_patterns.values()),
            "has_reviews_count": len([b for b in all_results if b.get('has_review')])
        }
    
    async def suggest_pattern_for_filename(self, filename: str, existing_patterns: List[Dict] = None) -> Dict[str, Any]:
        """
        为单个文件名建议解析规则
        
        Args:
            filename: 文件名
            existing_patterns: 现有规则列表（用于避免重复）
        
        Returns:
            建议结果
        """
        if not self.config.is_enabled():
            return {"success": False, "error": "AI功能未启用"}
        
        existing_info = ""
        if existing_patterns:
            existing_info = "\n现有规则：\n" + "\n".join([f"- {p.get('name', '')}: {p.get('regex', '')}" for p in existing_patterns[:5]])
        
        prompt = f"""为以下文件名生成解析规则，仅输出 JSON。

文件名: {filename}
{existing_info}

要求:
1) 仅输出 JSON，不要解释，不要 Markdown。
2) 不确定的字段写 null。
3) regex 兼容 Python re。

输出格式（严格一致）:
BEGIN_JSON
{{"title":"","author":null,"extra":null,"pattern":{{"name":"","regex":"","title_group":1,"author_group":2,"extra_group":0}},"confidence":0.5}}
END_JSON"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个专业的文件名解析助手。只返回JSON格式数据。"},
            {"role": "user", "content": prompt}
        ])  # 使用用户配置的 max_tokens
        
        if not response.success:
            return {"success": False, "error": response.error}
        
        result = self._extract_json_block(response.content)
        if result is None:
            log.warning("解析AI响应失败: JSON格式不正确")
            return {"success": False, "error": "解析响应失败: JSON格式不正确"}
        result["success"] = True
        return result


# 全局单例
_ai_service: Optional[AIService] = None

def get_ai_service() -> AIService:
    """获取AI服务单例"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
