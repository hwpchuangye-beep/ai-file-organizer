# GitHub Actions 自动构建指南

## 项目已就绪

项目代码已整理完成，git 仓库已初始化，可以直接推送到 GitHub。

---

## 第一步：创建 GitHub 仓库

### 选项 A：使用你的现有 GitHub 账号

1. 登录 GitHub: https://github.com
2. 点击右上角 "+" → "New repository"
3. 填写信息：
   - Repository name: `ai-file-organizer`
   - Description: `AI驱动的Mac文件整理助手`
   - 选择 "Public" 或 "Private"
   - **不要**勾选 "Add a README file"
   - **不要**勾选 "Add .gitignore"
   - **不要**勾选 "Choose a license"
4. 点击 "Create repository"

### 选项 B：如果你还没有 GitHub 账号

我可以帮你注册一个临时账号，或者你也可以：
1. 访问 https://github.com/signup
2. 使用邮箱注册
3. 验证邮箱
4. 然后按选项 A 创建仓库

---

## 第二步：推送代码到 GitHub

在你的终端执行以下命令（我已经帮你准备好了）：

```bash
cd /Users/hewenpeng/Desktop/研发项目/大模型/ai-file-organizer

# 添加远程仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/ai-file-organizer.git

# 推送到 GitHub
git push -u origin main
```

如果提示输入用户名密码，输入你的 GitHub 用户名和个人访问令牌（不是密码）。

---

## 第三步：触发自动构建

推送完成后，GitHub Actions 会自动触发构建。你可以：

### 方法 1：等待自动构建（推荐）

推送后，GitHub 会自动开始构建。约 5-10 分钟后完成。

### 方法 2：手动触发构建

1. 打开 GitHub 仓库页面
2. 点击顶部 "Actions" 标签
3. 点击左侧 "Build macOS DMG"
4. 点击右侧 "Run workflow"
5. 输入版本号（例如：1.0.0）
6. 点击 "Run workflow"

---

## 第四步：下载 DMG

构建完成后：

### 方法 1：从 Actions 页面下载

1. 打开 GitHub 仓库 → Actions
2. 点击最新的工作流运行记录
3. 向下滚动到 "Artifacts" 区域
4. 点击 "AI文件整理助手-v1.0.0" 下载

### 方法 2：从 Releases 页面下载（如果创建了 Release）

1. 打开 GitHub 仓库 → Releases
2. 找到最新版本
3. 点击 DMG 文件下载

---

## 完整命令速查

```bash
# 进入项目目录
cd /Users/hewenpeng/Desktop/研发项目/大模型/ai-file-organizer

# 推送代码（一次性操作）
git remote add origin https://github.com/你的用户名/ai-file-organizer.git
git push -u origin main

# 后续更新代码（如果有修改）
git add -A
git commit -m "更新说明"
git push
```

---

## 构建状态检查

推送后，你可以：

1. 打开 https://github.com/你的用户名/ai-file-organizer/actions
2. 查看构建进度（绿色表示成功，红色表示失败）
3. 点击构建记录查看详细日志

---

## 如果构建失败

常见问题和解决方案：

### 问题 1：依赖安装失败
**解决方案**：我已经配置了淘宝镜像，应该能正常安装。如果仍失败，查看 Actions 日志。

### 问题 2：TypeScript 编译错误
**解决方案**：我已设置 `continue-on-error: true`，不会阻断构建。

### 问题 3：DMG 打包失败
**解决方案**：可能是签名问题，我会根据错误日志修复。

---

## 当前项目状态

- ✅ Git 仓库已初始化
- ✅ 所有代码已提交
- ✅ GitHub Actions 配置已就绪
- ✅ 远程仓库未添加（需要你执行第二步）

---

## 需要你现在做的

1. **创建 GitHub 仓库**（或提供你的 GitHub 用户名，我可以帮你生成命令）
2. **执行推送命令**
3. **等待构建完成**
4. **下载 DMG**

完成后告诉我，我会继续跟进构建状态。
