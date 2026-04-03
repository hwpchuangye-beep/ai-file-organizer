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
    scanDirectory: (path, options) => ipcRenderer.invoke('scan-directory', path, options),
    
    // 文件定位
    showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    
    // 模型服务
    testModelConnection: (config) => ipcRenderer.invoke('test-model-connection', config),
    getModels: (config) => ipcRenderer.invoke('get-models', config),
    
    // 执行服务（仅保留受控查询/回滚接口）
    getLatestTask: () => ipcRenderer.invoke('get-latest-task'),
    getTaskHistory: () => ipcRenderer.invoke('get-task-history'),
    rollbackLatestTask: () => ipcRenderer.invoke('rollback-latest-task'),

    // Skill V2: 画像 -> 规划 -> 审批 -> 执行 -> 验证
    buildDirectoryProfile: (payload) => ipcRenderer.invoke('build-directory-profile', payload),
    generateOrganizationSchemes: (payload) => ipcRenderer.invoke('generate-organization-schemes', payload),
    approveOrganizationScheme: (payload) => ipcRenderer.invoke('approve-organization-scheme', payload),
    executeApprovedScheme: (payload) => ipcRenderer.invoke('execute-approved-scheme', payload),
    resumeExecutionTask: (payload) => ipcRenderer.invoke('resume-execution-task', payload),
    getExecutionCheckpoint: (payload) => ipcRenderer.invoke('get-execution-checkpoint', payload),
    verifyExecutionTask: (payload) => ipcRenderer.invoke('verify-execution-task', payload),

    // 偏好记忆（最小版）
    getPreferenceMemory: () => ipcRenderer.invoke('get-preference-memory'),
    savePreferenceMemory: (payload) => ipcRenderer.invoke('save-preference-memory', payload),
    updatePreferenceMemory: (payload) => ipcRenderer.invoke('update-preference-memory', payload),
    
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
