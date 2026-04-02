const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 引入服务
const modelService = require('./services/modelService.cjs');
const executionService = require('./services/executionService.cjs');

let mainWindow = null;

function createWindow() {
  // 确定 preload 的绝对路径
  // 使用 require.resolve 确保路径正确
  let preloadPath;
  try {
    // 尝试相对于当前文件的路径
    preloadPath = path.resolve(__dirname, 'preload.cjs');
    
    // 如果文件不存在，尝试其他路径
    if (!fs.existsSync(preloadPath)) {
      // 尝试从项目根目录
      preloadPath = path.resolve(process.cwd(), 'src', 'main', 'preload.cjs');
    }
    
    // 仍然不存在，尝试 dist 目录
    if (!fs.existsSync(preloadPath)) {
      preloadPath = path.resolve(process.cwd(), 'dist', 'main', 'preload.cjs');
    }
    
    if (!fs.existsSync(preloadPath)) {
      console.error('[Main] CRITICAL: preload.cjs not found at any location');
      console.error('[Main] __dirname:', __dirname);
      console.error('[Main] process.cwd():', process.cwd());
    } else {
      console.log('[Main] Preload path resolved to:', preloadPath);
    }
  } catch (e) {
    console.error('[Main] Error resolving preload path:', e);
    preloadPath = path.join(__dirname, 'preload.cjs');
  }

  console.log('[Main] Creating BrowserWindow...');
  console.log('[Main] Preload path:', preloadPath);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    show: false, // 先不显示，等加载完成
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,  // 必须开启才能使用 contextBridge
      nodeIntegration: false,  // 必须关闭以提高安全性
      sandbox: false,          // 开发模式下关闭 sandbox 以便 preload 工作
      allowRunningInsecureContent: false,
      webSecurity: true,
    },
  });

  // 等待窗口准备好再显示
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show');
    mainWindow.show();
    
    // 打开 DevTools 便于调试（开发模式）
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 监听页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page finished loading');
    
    // 检查 window.electronAPI 是否可用
    mainWindow.webContents.executeJavaScript(`
      (function() {
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI !== null) {
          console.log('[Renderer] electronAPI is available');
          return { success: true, methods: Object.keys(window.electronAPI) };
        } else {
          console.error('[Renderer] electronAPI is NOT available');
          return { success: false, error: 'electronAPI not found' };
        }
      })()
    `).then(result => {
      if (result.success) {
        console.log('[Main] electronAPI verified, methods:', result.methods.length);
      } else {
        console.error('[Main] electronAPI verification FAILED');
      }
    }).catch(err => {
      console.error('[Main] Error verifying electronAPI:', err);
    });
  });

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = ['debug', 'log', 'warn', 'error'][level] || 'log';
    console.log(`[Renderer:${prefix}] ${message}`);
  });

  // 加载页面
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading dev server:', process.env.VITE_DEV_SERVER_URL);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    console.log('[Main] Loading production file:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('[Main] Electron app ready');
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

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-desktop-path', () => {
  return path.join(os.homedir(), 'Desktop');
});

ipcMain.handle('get-downloads-path', () => {
  return path.join(os.homedir(), 'Downloads');
});

ipcMain.handle('scan-directory', async (_, dirPath) => {
  try {
    const files = await scanDirectory(dirPath);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-model-connection', async (_, config) => {
  return await modelService.testConnection(config);
});

ipcMain.handle('get-models', async (_, config) => {
  return await modelService.getModels(config);
});

ipcMain.handle('generate-schemes', async (_, scanResult, modelConfig) => {
  return await modelService.generateSchemes(scanResult, modelConfig);
});

ipcMain.handle('execute-task', async (_, taskPayload) => {
  return await executionService.executeTask(taskPayload);
});

ipcMain.handle('get-latest-task', async () => {
  return await executionService.getLatestTask();
});

ipcMain.handle('get-task-history', async () => {
  return await executionService.getTaskHistory();
});

ipcMain.handle('rollback-latest-task', async () => {
  return await executionService.rollbackLatestTask();
});

ipcMain.handle('show-in-folder', async (_, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder', async (_, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-hidden-directories', async (_, targetPath) => {
  try {
    const hiddenDirs = await executionService.detectHiddenDirectories(targetPath);
    return { success: true, hiddenDirs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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
