# 本地模式配置说明

本项目已简化为本地单用户模式，所有配置都有默认值，无需额外的环境变量配置。

## 默认配置

### 端口配置
- 后端服务器：`http://localhost:3000`
- 前端服务器：`http://localhost:5173`
- Artboard 服务器：`http://localhost:6173`

### 数据库配置
- 类型：SQLite
- 文件：`./local-resume.db`

### 存储配置
- 类型：本地文件系统
- 目录：`./uploads/`

## 启动方式

### 开发模式
```bash
pnpm dev
```

### 生产构建
```bash
pnpm build
pnpm start
```

## 可选环境变量

如果需要自定义配置，可以创建 `.env` 文件并设置以下变量：

```bash
# 端口配置
PORT=3000

# URL 配置
PUBLIC_URL=http://localhost:5173
STORAGE_URL=http://localhost:3000

# 数据库配置
DATABASE_URL=file:./local-resume.db

# PDF 生成配置
CHROME_URL=http://localhost:6173
CHROME_IGNORE_HTTPS_ERRORS=true
```

## 数据重置

要重置所有数据，删除以下文件/目录：
- `local-resume.db` - 数据库文件
- `uploads/` - 上传文件目录 