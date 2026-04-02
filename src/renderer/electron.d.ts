export interface MovedFile {
  name: string
  source: string
  target: string
  method?: string
  note?: string | null
}

export interface FailedFile {
  name?: string
  source: string
  target?: string
  reason: string
  errorCode: string
  originalError?: string
  existsInSource?: boolean
  suggestion?: string
  type?: 'folder_create' | 'file_move'
}

export interface SkippedFile {
  name: string
  source?: string
  reason: string
  invalidData?: boolean
}

export interface ExecutionStats {
  scanned: number
  planned: number
  attempted: number
  succeeded: number
  failed: number
  skipped: number
  consistency?: {
    totalMatches: boolean
    attempted: number
    accounted: number
    discrepancy: number
  }
}

export interface OrganizationTask {
  taskId: string
  targetPath: string
  schemeId?: string
  stats: ExecutionStats
  createdFolders: string[]
  movedFiles: MovedFile[]
  skippedFiles: SkippedFile[]
  failedFiles: FailedFile[]
  startedAt: string
  finishedAt?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  errorDetails?: any
  logs?: any[]
  rolledback?: boolean
  rollbackResult?: any
}

export interface ModelConfig {
  mode: 'local' | 'cloud'
  baseUrl: string
  modelName: string
  apiKey?: string
  isConnected: boolean
  lastCheckedAt?: string
}

export interface FileInfo {
  name: string
  path: string
  relativePath: string
  size: number
  createdAt: Date
  modifiedAt: Date
  extension: string
}

export interface ScanResult {
  targetPath: string
  totalFiles: number
  analyzableFiles: number
  files: FileInfo[]
  issueSummary: any
  issueTags: string[]
  riskFlags: string[]
}

export interface OrganizationScheme {
  schemeId: string
  schemeName: string
  reason: string
  suggestedFolders: string[]
  plannedMoves: Array<{
    file: FileInfo
    targetFolder: string
    targetPath: string
    confidence: 'high' | 'medium' | 'low'
  }>
  uncertainItems: any[]
  previewTree: any
  source?: 'model' | 'fallback'
}

declare global {
  interface Window {
    electronAPI: {
      // 基础文件操作
      selectDirectory: () => Promise<string | null>
      getDesktopPath: () => Promise<string>
      getDownloadsPath: () => Promise<string>
      scanDirectory: (path: string) => Promise<{ success: boolean; files?: any[]; error?: string }>
      
      // 文件定位
      showInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
      openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
      
      // 模型服务
      testModelConnection: (config: { baseUrl: string; apiKey?: string }) => Promise<{ success: boolean; message?: string; models?: string[] }>
      getModels: (config: { baseUrl: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; message?: string }>
      generateSchemes: (scanResult: ScanResult, modelConfig: ModelConfig) => Promise<any>
      
      // 执行服务
      executeTask: (taskPayload: any) => Promise<any>
      getLatestTask: () => Promise<OrganizationTask | null>
      getTaskHistory: () => Promise<OrganizationTask[]>
      rollbackLatestTask: () => Promise<any>
      
      // 隐藏目录检测与修复
      detectHiddenDirectories: (targetPath: string) => Promise<{ success: boolean; hiddenDirs?: any[]; error?: string }>
      generateRepairPreview: (targetPath: string) => Promise<{ success: boolean; preview?: any[]; hiddenCount?: number; message?: string; error?: string }>
      repairHiddenDirectories: (targetPath: string) => Promise<{ success: boolean; repaired?: any[]; failed?: any[]; message?: string; error?: string }>
    }
  }
}

export {}
