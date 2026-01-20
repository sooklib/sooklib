# 小说书库管理系统 - Docker 网络问题解决方案

## 问题诊断

您的 Docker 环境无法解析任何域名（`Temporary failure in name resolution`），这是 Docker DNS 配置问题。

## 解决方案

### 方案1：修复 Docker DNS（推荐）

编辑 Docker daemon 配置文件：

```bash
sudo nano /etc/docker/daemon.json
```

添加以下内容：

```json
{
  "dns": ["8.8.8.8", "114.114.114.114", "223.5.5.5"]
}
```

重启 Docker：

```bash
sudo systemctl restart docker
```

### 方案2：使用宿主机网络

修改 `docker-compose.yml`，添加 `network_mode`:

```yaml
services:
  sooklib:
    build: .
    network_mode: "host"  # 添加这行
    # ... 其他配置
```

### 方案3：直接在宿主机运行（不用 Docker）

如果 Docker 网络问题难以解决，可以直接在宿主机运行：

```bash
cd sooklib

# 安装依赖
pip3 install -r requirements.txt

# 设置环境变量
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-password
export SECRET_KEY=your-secret-key

# 运行程序
python3 -m app.main
```

### 方案4：离线构建镜像

如果网络无法修复，可以在有网络的机器上构建镜像，然后导出：

```bash
# 在有网络的机器上
docker-compose build
docker save sooklib:latest > sooklib.tar

# 传输到目标服务器
# 在目标服务器上
docker load < sooklib.tar
docker-compose up -d
```

## 验证网络

测试 Docker 网络是否正常：

```bash
# 测试 DNS 解析
docker run --rm python:3.11-slim ping -c 4 8.8.8.8
docker run --rm python:3.11-slim ping -c 4 baidu.com

# 检查 DNS 配置
docker run --rm python:3.11-slim cat /etc/resolv.conf
```

## 推荐做法

1. 先修复 Docker DNS 配置（方案1）
2. 如果修复失败，使用宿主机网络（方案2）
3. 如果都不行，直接在宿主机运行（方案3）

项目代码本身没有问题，只是 Docker 网络配置导致无法下载依赖。
