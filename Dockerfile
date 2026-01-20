# ===========================================
# 阶段1: 构建 React WebUI
# ===========================================
FROM node:20-alpine AS react-builder

WORKDIR /app/react_app

# 复制 React 项目文件
COPY react_app/package.json ./

# 安装依赖（使用 npm install 因为没有 package-lock.json）
RUN npm install --registry=https://registry.npmmirror.com || npm install

# 复制源代码
COPY react_app/ ./

# 构建生产版本
RUN npm run build


# ===========================================
# 阶段2: 构建 Python 应用
# ===========================================
FROM python:3.11-slim

# 构建信息
ARG APP_VERSION="1.0.0"
ARG APP_CHANNEL="beta"
ENV APP_VERSION=${APP_VERSION}
ENV APP_CHANNEL=${APP_CHANNEL}

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    calibre \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt || \
    pip install --no-cache-dir -r requirements.txt

# 复制Python应用代码
COPY app/ ./app/
COPY config/ ./config/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# 从 React 构建阶段复制静态文件
COPY --from=react-builder /app/react_app/dist ./app/web/static/react

# 创建数据目录
RUN mkdir -p /app/data /app/covers /app/backups

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

# 启动命令
CMD ["python", "-m", "app.main"]
