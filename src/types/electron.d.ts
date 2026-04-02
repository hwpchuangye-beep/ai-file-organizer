interface ElectronAPI {
  // 基础文件操作
  selectDirectory: () => Promise<string | null>
  getDesktopPath: () => Promise<string>
  getDownloadsPath: () => Promise<string>
  scanDirectory: (path: string) => Promise<{ success: boolean; files?: any[]; error?: string }>
  
  // 模型服务
  testModelConnection: (config: any) => Promise<{ success: boolean; message: string; models?: string[] }>
  generateSchemes: (scanResult: any, modelConfig: any) => Promise<{ 
    success: boolean; 
    schemes?: any[]; 
    source?: 'model' | 'fallback';
    message?: string;
    error?: string 
  }>
  
  // 执行服务
  executeTask: (taskPayload: any) => Promise<{ success: boolean; result?: any; error?: string }>
  getLatestTask: () => Promise<any | null>
  getTaskHistory: () => Promise<any[]>
  rollbackLatestTask: () => Promise<{ 
    success: boolean; 
    partial?: boolean;
    result?: any; 
    message?: string;
    error?: string 
  }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
