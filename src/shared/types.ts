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

export interface OrganizationTask {
  taskId: string
  targetPath: string
  createdFolders: string[]
  movedFiles: { source: string; target: string }[]
  skippedFiles: string[]
  failedFiles: string[]
  startedAt: Date
  finishedAt?: Date
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface RollbackRecord {
  taskId: string
  originalPath: string
  currentPath: string
  rollbackStatus: 'pending' | 'success' | 'failed'
  rollbackErrorReason?: string
}
