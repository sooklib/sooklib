# 最终修复方案 - bcrypt 问题

## 问题原因

您在 Docker 容器内运行，但容器内的代码是旧版本的 `security.py`，需要重新构建镜像。

## 方案1：从 requirements.txt 中移除 passlib（推荐）

由于 Docker 网络问题无法构建镜像，我们直接不使用 passlib，只用 bcrypt：

### 步骤1：更新 requirements.txt

编辑 `sooklib/requirements.txt`，将：
```txt
passlib[bcrypt]>=1.7.4
```

改为：
```txt
bcrypt>=4.0.0
```

### 步骤2：确认 security.py 已更新

确保 `sooklib/app/security.py` 文件内容正确（直接使用 bcrypt，不使用 passlib）。

文件应该开头是：
```python
import bcrypt
from jose import JWTError, jwt
```

而**不是**：
```python
from passlib.context import CryptContext
```

### 步骤3：在容器内手动更新

```bash
# 进入 Docker 容器
docker exec -it sooklib bash

# 卸载 passlib
pip uninstall -y passlib

# 确保 bcrypt 已安装
pip install bcrypt

# 退出容器
exit

# 重启容器
docker restart sooklib
```

## 方案2：直接在宿主机运行（最简单）

既然 Docker 网络有问题，直接在宿主机运行更简单：

```bash
# 停止 Docker 容器
docker-compose down

# 在宿主机运行
cd sooklib
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 -m app.main
```

## 方案3：临时禁用密码哈希（测试用）

如果只是想先让系统跑起来，可以临时使用明文密码（**仅用于测试**）：

修改 `app/security.py`：
```python
def hash_password(password: str) -> str:
    # 临时使用简单加密（仅测试）
    return f"plain:{password}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hashed_password == f"plain:{plain_password}"
```

## 推荐操作

我强烈建议使用**方案2**（宿主机运行），因为：
1. 您的 Docker 网络有问题，无法构建镜像
2. 宿主机运行更简单，不需要处理 Docker 网络配置
3. 性能更好，调试更方便

如果必须用 Docker，使用**方案1**（进入容器手动更新）。
