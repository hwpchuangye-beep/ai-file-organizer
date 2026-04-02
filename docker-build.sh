#!/bin/bash

# Docker 构建脚本
# 用于在网络受限环境下构建 DMG

set -e

echo "🐳 使用 Docker 构建 AI 文件整理助手"
echo "=================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ 请先安装 Docker: https://docs.docker.com/desktop/install/mac/"
    exit 1
fi

echo "✓ Docker 已安装"

# 构建镜像
echo ""
echo "📦 构建 Docker 镜像（包含所有依赖）..."
docker build -t ai-file-organizer-build . || {
    echo "❌ Docker 构建失败"
    echo "尝试使用宿主机构建..."
    exit 1
}

# 运行容器进行构建
echo ""
echo "🔨 开始构建 DMG..."
mkdir -p release
docker run --rm \
    -v "$(pwd)/release:/app/release" \
    -v "$(pwd)/src:/app/src:ro" \
    ai-file-organizer-build \
    bash -c "npm run build && npm run build:main && npm run dist:mac"

echo ""
echo "✅ 构建完成！"
echo "📂 DMG 位置: ./release/"
ls -lh release/*.dmg 2>/dev/null || echo "⚠️ 请检查 release/ 目录"
