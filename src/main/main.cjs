const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// 引入服务
const modelService = require('./services/modelService.cjs');
const executionService = require('./services/executionService.cjs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

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
      entries = await fs.readdir(currentPath, { withFileTypes: true });
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
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(entry.name).toLowerCase(),
          });
        } catch (err) {
          // 忽略无法读取的文件
        }
      }
    }
  }
  
  await scan(dirPath);
  return files;
}
