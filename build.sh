#!/bin/bash

set -e

echo "🚀 AI 文件整理助手 - 构建脚本"
echo "================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装"
    exit 1
fi

echo "✓ Node.js 版本: $(node -v)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 安装依赖..."
    npm install
fi

# 构建渲染进程
echo ""
echo "🔨 构建渲染进程..."
npm run build

# 构建主进程
echo ""
echo "🔨 构建主进程..."
npm run build:main

# 打包 Electron 应用
echo ""
echo "📱 打包 Electron 应用..."
npx electron-builder --mac

echo ""
echo "✅ 构建完成！"
echo "📂 输出目录: release/"
echo ""
ls -lh release/*.dmg 2>/dev/null || echo "⚠️ 未找到 DMG 文件"
echo ""
