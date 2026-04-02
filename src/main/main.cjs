// Electron 主进程入口
console.log('[Main] ========================================');
console.log('[Main] app starting...');
console.log('[Main] process.argv:', process.argv);
console.log('[Main] process.cwd():', process.cwd());
console.log('[Main] __dirname:', __dirname);
console.log('[Main] process.platform:', process.platform);
console.log('[Main] Electron version:', process.versions.electron);
console.log('[Main] Node version:', process.versions.node);
console.log('[Main] ========================================');

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('[Main] Modules imported successfully');

// 全局错误捕获
process.on('uncaughtException', (error) => {
  console.error('[Main] UNCAUGHT EXCEPTION:');
  console.error(error);
  console.error('[Main] Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] UNHANDLED REJECTION at:', promise);
  console.error('[Main] reason:', reason);
});

// 引入服务
let modelService;
let executionService;

try {
  modelService = require('./services/modelService.cjs');
  executionService = require('./services/executionService.cjs');
  console.log('[Main] Services loaded successfully');
} catch (e) {
  console.error('[Main] Failed to load services:', e.message);
  console.error('[Main] Attempting fallback paths...');
  
  // 尝试其他路径
  try {
    modelService = require(path.join(__dirname, 'services', 'modelService.cjs'));
    executionService = require(path.join(__dirname, 'services', 'executionService.cjs'));
    console.log('[Main] Services loaded from absolute path');
  } catch (e2) {
    console.error('[Main] Failed to load services from all paths:', e2.message);
    process.exit(1);
  }
}

let mainWindow = null;

// 获取 preload 路径
function getPreloadPath() {
  console.log('[Main] Resolving preload path...');
  console.log('[Main] __dirname:', __dirname);
  
  const possiblePaths = [
    path.join(__dirname, 'preload.cjs'),
    path.join(process.cwd(), 'src', 'main', 'preload.cjs'),
    path.join(process.cwd(), 'dist', 'main', 'preload.cjs'),
  ];
  
  for (const p of possiblePaths) {
    console.log('[Main] Checking:', p, fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND');
    if (fs.existsSync(p)) {
      console.log('[Main] Using preload:', p);
      return p;
    }
  }
  
  console.error('[Main] CRITICAL: preload.cjs not found in any location!');
  return possiblePaths[0];
}

function createWindow() {
  console.log('[Main] createWindow() called');
  
  const preloadPath = getPreloadPath();
  console.log('[Main] Preload path resolved to:', preloadPath);
  
  console.log('[Main] Creating BrowserWindow...');
  
  try {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      titleBarStyle: 'hiddenInset',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        allowRunningInsecureContent: false,
        webSecurity: true,
      },
    });
    
    console.log('[Main] BrowserWindow created successfully');
    console.log('[Main] Window ID:', mainWindow.id);
    
  } catch (e) {
    console.error('[Main] FAILED to create BrowserWindow:', e);
    console.error('[Main] Stack:', e.stack);
    return;
  }

  // 窗口事件监听
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Event: ready-to-show');
    console.log('[Main] Showing window...');
    mainWindow.show();
    
    if (process.env.VITE_DEV_SERVER_URL) {
      console.log('[Main] Opening DevTools...');
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('show', () => {
    console.log('[Main] Event: window shown');
  });

  mainWindow.on('closed', () => {
    console.log('[Main] Event: window closed');
    mainWindow = null;
  });

  // 页面加载事件
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('[Main] WebContents: did-start-loading');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] WebContents: did-finish-load');
    
    // 验证 electronAPI
    mainWindow.webContents.executeJavaScript(`
      (function() {
        console.log('[Renderer] Checking window.electronAPI...');
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI !== null) {
          console.log('[Renderer] electronAPI is available, methods:', Object.keys(window.electronAPI).length);
          return { success: true, methodCount: Object.keys(window.electronAPI).length };
        } else {
          console.error('[Renderer] electronAPI is NOT available!');
          return { success: false, error: 'electronAPI not found' };
        }
      })()
    `).then(result => {
      if (result.success) {
        console.log('[Main] electronAPI verified, methods:', result.methodCount);
      } else {
        console.error('[Main] electronAPI verification FAILED');
      }
    }).catch(err => {
      console.error('[Main] Error verifying electronAPI:', err);
    });
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] WebContents: did-fail-load');
    console.error('[Main] Error code:', errorCode);
    console.error('[Main] Error description:', errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] WebContents: render-process-gone');
    console.error('[Main] Details:', details);
  });

  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('[Main] WebContents: crashed, killed:', killed);
  });

  // 控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['debug', 'log', 'warn', 'error'];
    const levelName = levels[level] || 'log';
    console.log(`[Renderer:${levelName}] ${message}`);
  });

  // 加载页面
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = process.env.VITE_DEV_SERVER_URL;
    console.log('[Main] Loading dev server URL:', url);
    
    mainWindow.loadURL(url).then(() => {
      console.log('[Main] loadURL succeeded');
    }).catch(err => {
      console.error('[Main] loadURL FAILED:', err);
    });
    
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    console.log('[Main] Loading production file:', htmlPath);
    console.log('[Main] File exists:', fs.existsSync(htmlPath));
    
    mainWindow.loadFile(htmlPath).then(() => {
      console.log('[Main] loadFile succeeded');
    }).catch(err => {
      console.error('[Main] loadFile FAILED:', err);
    });
  }
  
  console.log('[Main] createWindow() completed');
}

// 应用生命周期
console.log('[Main] Setting up app lifecycle handlers...');

app.whenReady().then(() => {
  console.log('[Main] ========================================');
  console.log('[Main] app.whenReady() entered');
  console.log('[Main] ========================================');
  createWindow();
}).catch(err => {
  console.error('[Main] app.whenReady() FAILED:', err);
});

app.on('window-all-closed', () => {
  console.log('[Main] Event: window-all-closed');
  if (process.platform !== 'darwin') {
    console.log('[Main] Quitting app (non-darwin platform)');
    app.quit();
  } else {
    console.log('[Main] Not quitting (darwin platform)');
  }
});

app.on('activate', () => {
  console.log('[Main] Event: activate');
  if (mainWindow === null) {
    console.log('[Main] Recreating window...');
    createWindow();
  }
});

app.on('quit', () => {
  console.log('[Main] Event: quit');
});

app.on('before-quit', () => {
  console.log('[Main] Event: before-quit');
});

// IPC Handlers
console.log('[Main] Setting up IPC handlers...');

ipcMain.handle('select-directory', async () => {
  console.log('[Main] IPC: select-directory');
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

console.log('[Main] IPC handlers setup complete');
console.log('[Main] Waiting for app.whenReady()...');

// Helper Functions
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
