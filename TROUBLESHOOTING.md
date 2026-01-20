# 无法访问 Web 界面故障排查

## 问题：浏览器显示"拒绝连接"

如果您看到 `192.168.0.106 拒绝了我们的连接请求`，可能的原因：

## 1. 检查服务是否正常启动

查看终端输出，应该看到类似这样的信息：
```
INFO     | __main__:startup:57 - 数据库初始化完成
INFO     | __main__:create_default_admin:40 - 创建默认管理员用户: admin
INFO     | __main__:startup:63 - 应用初始化完成
INFO     | __main__:main:75 - 启动Web服务器: 0.0.0.0:8080
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)
```

如果没看到最后几行 `Uvicorn running`，说明服务没有启动成功。

## 2. 检查端口是否被占用

```bash
# 检查8080端口是否被占用
netstat -tlnp | grep 8080

# 或者
lsof -i:8080
```

如果端口被占用，可以修改配置文件中的端口：

```bash
# 编辑配置文件
nano config/config.yaml

# 修改 server.port 为其他端口，如 8081
```

## 3. 检查防火墙设置

```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 8080

# CentOS/RHEL
sudo firewall-cmd --list-ports
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

## 4. 修复目录路径问题

如果在宿主机运行（不是Docker），需要修改配置文件中的路径：

```bash
cd sooklib

# 编辑配置文件
nano config/config.yaml
```

修改以下部分：
```yaml
# 目录配置
directories:
  data: ./data          # 改为相对路径
  covers: ./covers      # 改为相对路径
  temp: ./temp          # 改为相对路径

# 日志配置
logging:
  file: ./data/logs/app.log  # 改为相对路径
```

然后重新运行：
```bash
python3 -m app.main
```

## 5. 使用环境变量覆盖配置

不修改配置文件，直接通过环境变量设置：

```bash
cd sooklib

# 设置环境变量
export SERVER_HOST=0.0.0.0
export SERVER_PORT=8080

# 运行
python3 -m app.main
```

## 6. 验证服务是否正常

在服务器本地测试：
```bash
# 使用curl测试
curl http://localhost:8080/api/stats

# 或者
wget http://localhost:8080
```

如果本地可以访问，但远程无法访问，那就是防火墙问题。

## 7. 查看完整日志

```bash
# 查看日志文件
tail -f data/logs/app.log

# 或者查看终端输出
```

## 快速解决方案

创建一个新的配置文件用于宿主机运行：

```bash
cd sooklib

# 创建本地配置
cat > config/config-local.yaml << 'EOF'
server:
  host: 0.0.0.0
  port: 8080
  reload: false

database:
  url: sqlite+aiosqlite:///./data/library.db

directories:
  data: ./data
  covers: ./covers
  temp: ./temp

scanner:
  interval: 3600
  recursive: true
  supported_formats:
    - .txt
    - .epub
    - .mobi
    - .azw3
    - .zip
    - .7z
    - .tar.gz

deduplicator:
  enable: true
  hash_algorithm: md5
  similarity_threshold: 0.85

security:
  secret_key: "change-this-to-random-secret"
  algorithm: HS256
  access_token_expire_minutes: 10080

logging:
  level: INFO
  format: json
  max_size: 10485760
  backup_count: 5
  file: ./data/logs/app.log

opds:
  title: "我的小说书库"
  author: "Sooklib"
  description: "个人小说收藏"
  page_size: 50
EOF

# 使用新配置运行
python3 -m app.main
```

## 最简单的测试方法

如果以上都不行，直接运行最小化测试：

```bash
cd sooklib

# 创建测试脚本
python3 << 'EOF'
import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "服务正常"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
EOF
```

如果这个能访问，说明是应用代码问题；如果这个也不能访问，说明是网络/防火墙问题。
