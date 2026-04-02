const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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
});
