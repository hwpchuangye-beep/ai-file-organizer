const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 基础文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
  
  // 模型服务
  testModelConnection: (config) => ipcRenderer.invoke('test-model-connection', config),
  generateSchemes: (scanResult, modelConfig) => ipcRenderer.invoke('generate-schemes', scanResult, modelConfig),
  
  // 执行服务
  executeTask: (taskPayload) => ipcRenderer.invoke('execute-task', taskPayload),
  getLatestTask: () => ipcRenderer.invoke('get-latest-task'),
  getTaskHistory: () => ipcRenderer.invoke('get-task-history'),
  rollbackLatestTask: () => ipcRenderer.invoke('rollback-latest-task'),
});
