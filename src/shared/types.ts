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
  issueSummary: IssueSummary
  issueTags: string[]
  riskFlags: string[]
}

export interface IssueSummary {
  screenshotsCount: number
  downloadsCount: number
  similarFilesCount: number
  scatteredProjectFiles: number
  namingIssuesCount: number
}

export interface OrganizationScheme {
  schemeId: string
  schemeName: string
  reason: string
  suggestedFolders: string[]
  plannedMoves: PlannedMove[]
  uncertainItems: UncertainItem[]
  previewTree: DirectoryNode
  source?: 'model' | 'fallback'
}

export interface PlannedMove {
  file: FileInfo
  targetFolder: string
  targetPath: string
  confidence: 'high' | 'medium' | 'low'
}

export interface UncertainItem {
  file: FileInfo
  reason: string
  suggestions: string[]
}

export interface DirectoryNode {
  name: string
  path: string
  children: (DirectoryNode | FileNode)[]
}

export interface FileNode {
  name: string
  path: string
  isFile: true
}

// 增强的错误码类型
export type FailedFileErrorCode =
  | 'DUPLICATE_NAME'           // 重名冲突
  | 'PERMISSION_DENIED'        // 权限不足
  | 'SOURCE_NOT_FOUND'         // 源文件不存在
  | 'TARGET_DIR_NOT_FOUND'     // 目标目录不存在
  | 'TARGET_DIR_CREATE_FAILED' // 创建目标目录失败
  | 'MOVE_FAILED'              // 移动操作失败
  | 'FILE_LOCKED'              // 文件被占用
  | 'CROSS_VOLUME_MOVE'        // 跨卷移动需要复制
  | 'CROSS_VOLUME_FAILED'      // 跨卷移动失败
  | 'INVALID_PATH'             // 无效路径
  | 'INVALID_PATH_CHARS'       // 非法字符
  | 'DISK_FULL'                // 磁盘空间不足
  | 'DIR_NOT_EMPTY'            // 目录不为空
  | 'IS_DIRECTORY'             // 目标是目录
  | 'NOT_DIRECTORY'            // 路径不是目录
  | 'READONLY_FS'              // 只读文件系统
  | 'NAME_TOO_LONG'            // 文件名过长
  | 'PATH_NOT_FOUND'           // 路径不存在（通用）
  | 'UNKNOWN'                  // 未知错误

export interface FailedFile {
  name?: string
  source: string
  target?: string
  reason: string
  errorCode: FailedFileErrorCode
  originalError?: string
  existsInSource?: boolean
  suggestion?: string
  type?: 'folder_create' | 'file_move'  // 错误类型
}

export interface MovedFile {
  name: string
  source: string
  target: string
  method?: string
  note?: string | null
}

export interface SkippedFile {
  name: string
  source?: string
  reason: string
  invalidData?: boolean
}

// 执行统计
export interface ExecutionStats {
  scanned: number      // 扫描到的文件数
  planned: number      // 计划处理数（有效的）
  attempted: number    // 实际尝试数
  succeeded: number    // 成功数
  failed: number       // 失败数
  skipped: number      // 跳过数
  consistency?: {      // 一致性校验
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
  stats: ExecutionStats  // 详细统计
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

export interface RollbackRecord {
  taskId: string
  originalPath: string
  currentPath: string
  rollbackStatus: 'pending' | 'success' | 'failed'
  rollbackErrorReason?: string
}
