# ==================== 阶段1: 构建Flutter Web ====================
FROM debian:bullseye-slim AS flutter-builder

# 安装必要的依赖
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    xz-utils \
    zip \
    libglu1-mesa \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安装Flutter SDK - 使用3.16版本（Dart 3.2，兼容SDK >=3.0.0）
ENV FLUTTER_HOME=/opt/flutter
ENV PATH="$FLUTTER_HOME/bin:$PATH"

# 国内镜像加速
ENV PUB_HOSTED_URL=https://pub.flutter-io.cn
ENV FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn

# 克隆特定版本的Flutter
RUN git clone https://github.com/flutter/flutter.git -b 3.16.9 --depth 1 $FLUTTER_HOME && \
    flutter doctor -v && \
    flutter config --no-analytics && \
    flutter config --enable-web && \
    flutter precache --web --no-android --no-ios --no-linux --no-windows --no-macos

# 复制Flutter项目
WORKDIR /build/flutter_app

# 先复制依赖文件（利用Docker缓存）
COPY flutter_app/pubspec.yaml flutter_app/pubspec.lock* ./
RUN flutter pub get || true

# 复制所有源代码
COPY flutter_app/ ./

# 验证文件存在并构建
RUN ls -la && \
    ls -la lib/ && \
    flutter pub get && \
    flutter build web --release --web-renderer canvaskit

# ==================== 阶段2: Python应用 ====================
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt || \
    pip install --no-cache-dir -r requirements.txt

# 复制Python应用代码
COPY app/ ./app/
COPY config/ ./config/

# 从Flutter构建阶段复制构建产物
COPY --from=flutter-builder /build/flutter_app/build/web ./app/web/static/flutter/

# 创建数据目录
RUN mkdir -p /app/data /app/covers

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["python", "-m", "app.main"]
