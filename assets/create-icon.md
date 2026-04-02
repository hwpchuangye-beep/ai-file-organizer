# 应用图标制作指南

## macOS 图标要求

macOS 应用需要 `.icns` 格式的图标文件。

## 快速制作图标

### 方法1: 使用 sips 和 iconutil (推荐)

```bash
# 1. 准备 1024x1024 的 PNG 图标文件 icon.png
# 2. 运行以下命令

mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

### 方法2: 使用在线工具

1. 访问 https://iconverticons.com/online/
2. 上传 PNG 图标
3. 下载 ICNS 格式

### 方法3: 使用 Figma/Sketch 导出

1. 在 Figma 中创建 1024x1024 的设计
2. 使用插件 "Export Icons for Mac"
3. 直接导出 .icns 文件

## 图标设计建议

- **尺寸**: 1024x1024 像素
- **格式**: 带透明通道的 PNG
- **风格**: 简洁扁平，符合 macOS Big Sur/Monterey 风格
- **圆角**: macOS 图标使用特定圆角，可参考 Apple 设计资源

## 放置位置

将生成的 `icon.icns` 文件放在 `assets/icon.icns`

然后重新运行构建命令：
```bash
npm run dist:mac
```
