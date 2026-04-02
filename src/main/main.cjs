const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 引入服务
const modelService = require('./services/modelService.cjs');
const executionService = require('./services/executionService.cjs');

let mainWindow = null;

// 获取正确的 preload 路径
function getPreloadPath() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL || !!process.env.ELECTRON_DEV_MODE;
  
  console.log('[Main] Is dev mode:', isDev);
  console.log('[Main] __dirname:', __dirname);
  
  if (isDev) {
    // Dev 模式：直接从 src/main 加载
    const devPath = path.join(process.cwd(), 'src', 'main', 'preload.cjs');
    console.log('[Main] Dev preload path:', devPath);
    if (fs.existsSync(devPath)) {
      console.log('[Main] Using dev preload:', devPath);
      return devPath;
    }
  }
  
  // 生产模式或 fallback
  const prodPath = path.join(__dirname, 'preload.cjs');
  console.log('[Main] Prod preload path:', prodPath);
  
  if (fs.existsSync(prodPath)) {
    console.log('[Main] Using prod preload:', prodPath);
    return prodPath;
  }
  
  // 尝试其他可能的路径
  const fallbackPaths = [
    path.join(process.cwd(), 'dist', 'main', 'preload.cjs'),
    path.join(process.cwd(), 'preload.cjs'),
  ];
  
  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      console.log('[Main] Using fallback preload:', p);
      return p;
    }
  }
  
  console.error('[Main] Preload not found! Tried:', [prodPath, ...fallbackPaths]);
  return prodPath; // 返回默认路径，让 Electron 报错
}

function createWindow() {
  const preloadPath = getPreloadPath();
  
  console.log('[Main] Creating window with preload:', preloadPath);
  console.log('[Main] __dirname:', __dirname);
  console.log('[Main] process.cwd():', process.cwd());
  console.log('[Main] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      // 开发模式下的安全设置
      allowRunningInsecureContent: !!process.env.VITE_DEV_SERVER_URL,
      webSecurity: !process.env.VITE_DEV_SERVER_URL,
    },
  });

  // 监听 preload 注入情况
  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Main] DOM ready, checking preload...');
    // 执行 JS 检查 window.electronAPI
    mainWindow.webContents.executeJavaScript(`
      console.log('[Renderer] window.electronAPI:', typeof window.electronAPI);
      if (window.electronAPI) {
        console.log('[Renderer] electronAPI methods:', Object.keys(window.electronAPI));
      } else {
        console.error('[Renderer] electronAPI is undefined!');
      }
    `);
  });

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['debug', 'log', 'warn', 'error'];
    console.log(`[Renderer:${levels[level] || level}] ${message}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading dev server URL:', process.env.VITE_DEV_SERVER_URL);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    console.log('[Main] Loading production file');
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('[Main] App ready');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ========== IPC Handlers ==========

// 选择目录
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

// 获取桌面路径
ipcMain.handle('get-desktop-path', () => {
  return path.join(os.homedir(), 'Desktop');
});

// 获取下载路径
ipcMain.handle('get-downloads-path', () => {
  return path.join(os.homedir(), 'Downloads');
});

// 扫描目录
ipcMain.handle('scan-directory', async (_, dirPath) => {
  try {
    const files = await scanDirectory(dirPath);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 测试模型连接
ipcMain.handle('test-model-connection', async (_, config) => {
  return await modelService.testConnection(config);
});

// 获取模型列表
ipcMain.handle('get-models', async (_, config) => {
  return await modelService.getModels(config);
});

// 生成整理方案
ipcMain.handle('generate-schemes', async (_, scanResult, modelConfig) => {
  return await modelService.generateSchemes(scanResult, modelConfig);
});

// 执行整理任务
ipcMain.handle('execute-task', async (_, taskPayload) => {
  return await executionService.executeTask(taskPayload);
});

// 获取最近任务
ipcMain.handle('get-latest-task', async () => {
  return await executionService.getLatestTask();
});

// 获取任务历史
ipcMain.handle('get-task-history', async () => {
  return await executionService.getTaskHistory();
});

// 撤销最近任务
ipcMain.handle('rollback-latest-task', async () => {
  return await executionService.rollbackLatestTask();
});

// 在 Finder 中显示文件
ipcMain.handle('show-in-folder', async (_, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 打开文件夹
ipcMain.handle('open-folder', async (_, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ========== 隐藏目录检测与修复 ==========

// 检测隐藏目录
ipcMain.handle('detect-hidden-directories', async (_, targetPath) => {
  try {
    const hiddenDirs = await executionService.detectHiddenDirectories(targetPath);
    return { success: true, hiddenDirs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 生成修复预览
ipcMain.handle('generate-repair-preview', async (_, targetPath) => {
  try {
    const hiddenDirs = await executionService.detectHiddenDirectories(targetPath);
    if (hiddenDirs.length === 0) {
      return { success: true, preview: [], message: '未发现隐藏目录' };
    }
    const preview = await executionService.generateRepairPreview(hiddenDirs, targetPath);
    return { success: true, preview, hiddenCount: hiddenDirs.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 执行修复
ipcMain.handle('repair-hidden-directories', async (_, targetPath) => {
  try {
    const result = await executionService.repairHiddenDirectories(targetPath);
    return { success: result.success, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ========== Helper Functions ==========

async function scanDirectory(dirPath) {
  const files = [];
  
  async function scan(currentPath, relativePath = '') {
    let entries;
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (err) {
      return;
    }
    
    for (const entry of entries) {
      // 跳过隐藏文件和目录
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(entry.name).toLowerCase(),
          });
        } catch (e) {}
      }
    }
  }
  
  await scan(dirPath);
  return files;
}
