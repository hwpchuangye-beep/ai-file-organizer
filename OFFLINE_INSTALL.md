# 离线安装方案

由于当前网络环境 npm install 超时，提供以下替代方案：

## 方案一：使用 Yarn（通常更快）

```bash
cd ai-file-organizer

# 安装 yarn（如果未安装）
npm install -g yarn

# 使用 yarn 安装（通常比 npm 快）
yarn install

# 构建
yarn build
yarn build:main
yarn dist:mac
```

## 方案二：使用 pnpm（推荐）

```bash
cd ai-file-organizer

# 安装 pnpm
npm install -g pnpm

# 使用 pnpm 安装（速度快，缓存好）
pnpm install

# 构建
pnpm build
pnpm build:main
pnpm dist:mac
```

## 方案三：手动下载依赖包

如果上述方法都失败，可以手动下载我准备的依赖包：

### 步骤 1：下载预打包的 node_modules
我会将 node_modules 打包上传到可下载的位置，你可以：

```bash
cd ai-file-organizer

# 下载预打包的依赖（我会提供下载链接）
curl -L -o node_modules.tar.gz "[下载链接]"
tar -xzf node_modules.tar.gz

# 构建
npm run build
npm run build:main
npm run dist:mac
```

### 步骤 2：如果下载链接不可用

你可以在其他网络良好的机器上：

```bash
# 在另一台机器上
git clone <项目地址>
cd ai-file-organizer
npm install

# 打包 node_modules
tar -czf node_modules.tar.gz node_modules

# 复制到目标机器
```

## 方案四：使用 cnpm（淘宝镜像）

```bash
# 安装 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com

# 使用 cnpm 安装
cnpm install

# 构建
npm run build
npm run build:main
npm run dist:mac
```

## 方案五：跳过 Electron，先用网页版验证

如果 Electron 依赖始终无法安装，可以先运行网页版验证核心逻辑：

```bash
# 只安装 vite 和 react（通常能成功）
npm install vite react react-dom react-router-dom --legacy-peer-deps

# 启动开发服务器
npm run dev:vite

# 然后在浏览器中访问 http://localhost:5173
# 注意：文件操作功能会失效，但 UI 和流程可以验证
```

## 当前环境确认

在你的环境中，我已经创建了：
1. ✅ 完整的源代码
2. ✅ Dockerfile（方案A）
3. ✅ docker-build.sh（方案B）

请优先尝试：
1. `yarn install` 或 `pnpm install`
2. 如果失败，使用 Docker 构建
3. 如果 Docker 也不行，请告诉我，我会提供预打包的 node_modules 下载

## 急需 DMG 的临时方案

如果你急需一个可运行的 DMG 而我这边网络始终无法构建，我可以：
1. 将代码推送到 GitHub
2. 使用 GitHub Actions 自动构建 DMG
3. 你直接从 GitHub Releases 下载 DMG

需要我设置 GitHub Actions 吗？
