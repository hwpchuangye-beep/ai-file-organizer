// Electron Preload Script
// 这个脚本在渲染进程之前执行，用于安全地暴露主进程 API

const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script starting...');
console.log('[Preload] process.contextIsolated:', process.contextIsolated);

try {
  // 定义要暴露的 API
  const api = {
    // 基础文件操作
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
    getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    
    // 文件定位
    showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    
    // 模型服务
    testModelConnection: (config) => ipcRenderer.invoke('test-model-connection', config),
    getModels: (config) => ipcRenderer.invoke('get-models', config),
    generateSchemes: (scanResult, modelConfig) => ipcRenderer.invoke('generate-schemes', scanResult, modelConfig),
    
    // 执行服务
    executeTask: (taskPayload) => ipcRenderer.invoke('execute-task', taskPayload),
    getLatestTask: () => ipcRenderer.invoke('get-latest-task'),
    getTaskHistory: () => ipcRenderer.invoke('get-task-history'),
    rollbackLatestTask: () => ipcRenderer.invoke('rollback-latest-task'),
    
    // 隐藏目录检测与修复
    detectHiddenDirectories: (targetPath) => ipcRenderer.invoke('detect-hidden-directories', targetPath),
    generateRepairPreview: (targetPath) => ipcRenderer.invoke('generate-repair-preview', targetPath),
    repairHiddenDirectories: (targetPath) => ipcRenderer.invoke('repair-hidden-directories', targetPath),
  };

  // 使用 contextBridge 安全地暴露 API
  if (process.contextIsolated) {
    // 上下文隔离开启时使用 contextBridge
    contextBridge.exposeInMainWorld('electronAPI', api);
    console.log('[Preload] API exposed via contextBridge');
  } else {
    // 上下文隔离关闭时直接挂载（不推荐，仅用于调试）
    window.electronAPI = api;
    console.log('[Preload] API exposed directly to window (contextIsolation is off)');
  }

  // 验证暴露是否成功
  console.log('[Preload] Exposed methods:', Object.keys(api).join(', '));
  
} catch (error) {
  console.error('[Preload] CRITICAL ERROR:', error);
  console.error('[Preload] Stack:', error.stack);
}

console.log('[Preload] Script completed');
