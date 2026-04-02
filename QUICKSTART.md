# AI 文件整理助手 - 快速开始

## 环境要求

- macOS 10.15 或更高版本
- Node.js 18+ (建议 20 LTS)
- npm 或 yarn

## 安装依赖

```bash
cd ai-file-organizer
npm install
```

## 开发模式运行

```bash
# 方式1: 使用 concurrently 同时启动 Vite 和 Electron
npm run dev

# 方式2: 手动启动 (两个终端)
# 终端1:
npm run dev:vite

# 终端2 (等 Vite 启动后):
npm run dev:electron
```

## 构建生产版本

```bash
# 完整构建流程
npm run dist:mac

# 或分步执行
npm run build           # 构建渲染进程
npm run build:main      # 复制主进程文件
npm run dist            # 打包 DMG
```

构建完成后，DMG 文件位于 `release/` 目录。

## 项目结构说明

```
ai-file-organizer/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.cjs       # 主入口 (CommonJS)
│   │   └── preload.cjs    # 预加载脚本
│   ├── renderer/          # React 前端
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 通用组件
│   │   ├── context/       # 状态管理
│   │   ├── App.tsx        # 应用根组件
│   │   ├── main.tsx       # 渲染进程入口
│   │   └── styles.css     # 全局样式
│   ├── shared/            # 共享类型
│   │   └── types.ts
│   └── types/             # 类型声明
│       └── electron.d.ts
├── assets/                # 应用图标等资源
├── dist/                  # 构建输出
├── release/               # 打包输出 (DMG)
├── index.html             # HTML 模板
├── package.json
├── tsconfig.json
├── vite.config.ts
└── build.sh               # 构建脚本
```

## 开发注意事项

1. **主进程使用 CommonJS**: Electron 主进程使用 `.cjs` 文件和 CommonJS 语法
2. **渲染进程使用 ESM**: React 代码使用 ES Modules 和 TypeScript
3. **IPC 通信**: 通过 `window.electronAPI` 访问主进程功能
4. **类型支持**: 修改类型后需要重启 TypeScript 服务

## 常见问题

### 1. 端口被占用
```bash
lsof -ti:5173 | xargs kill -9
lsof -ti:3080 | xargs kill -9
```

### 2. 清空构建缓存
```bash
rm -rf dist/ release/ node_modules/.vite/
```

### 3. 权限问题
如果应用无法访问文件系统，请检查:
- macOS 系统偏好设置 -> 安全性与隐私 -> 文件和文件夹
- 确保应用有访问 Desktop、Downloads 的权限

## 功能模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 首页 | ✅ | 三大入口按钮，模型状态显示 |
| 模型配置 | ✅ | 本地/云端模式，测试连接 |
| 扫描结果 | ✅ | 文件统计，问题摘要 |
| 方案推荐 | ✅ | 3套方案生成展示 |
| 方案微调 | ✅ | 排除文件功能 |
| 执行确认 | ✅ | 操作预览 |
| 执行中 | ✅ | 进度显示 |
| 结果页 | ✅ | 完成展示，撤销入口 |
| 历史记录 | ✅ | 最近任务列表 |
| 撤销功能 | ⚠️ | UI就绪，需完善逻辑 |
| AI 集成 | ⚠️ | 预留接口，需接入真实模型 |

## 下一步开发建议

1. **接入真实 AI 模型**
   - 实现方案生成 API 调用
   - 优化 prompt 工程

2. **完善撤销功能**
   - 实现文件移动记录
   - 实现回滚逻辑

3. **优化 UI/UX**
   - 添加动画效果
   - 优化深色模式

4. **添加图标资源**
   - 制作 app icon
   - 添加 DMG 背景图

## 联系支持

如有问题，请查看 README.md 或提交 issue。
