# AI 文件整理助手 - Docker 构建环境
# 使用此 Dockerfile 可以在容器内完成依赖安装和构建

FROM node:20-slim

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libuuid1 \
    libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package.json ./

# 使用淘宝镜像安装依赖
RUN npm config set registry https://registry.npmmirror.com/ \
    && npm install --legacy-peer-deps

# 复制源代码
COPY . .

# 构建命令
# docker build -t ai-file-organizer-build .
# docker run --rm -v $(pwd)/release:/app/release ai-file-organizer-build npm run dist:mac
