const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Starting preload script...');

try {
  const electronAPI = {
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

  // 暴露 API 到渲染进程
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  
  console.log('[Preload] electronAPI exposed successfully');
  console.log('[Preload] Available methods:', Object.keys(electronAPI));
  
  // 验证暴露是否成功
  if (typeof window !== 'undefined') {
    console.log('[Preload] window.electronAPI check:', typeof window.electronAPI);
  }
} catch (error) {
  console.error('[Preload] Error exposing electronAPI:', error);
}

// 添加一个全局错误处理器
process.on('uncaughtException', (error) => {
  console.error('[Preload] Uncaught exception:', error);
});
