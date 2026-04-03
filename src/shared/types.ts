export interface ModelConfig {
  mode: 'local' | 'cloud'
  baseUrl: string
  modelName: string
  apiKey?: string
  isConnected: boolean
  lastCheckedAt?: string
}

export type SourceType = 'desktop' | 'downloads' | 'user_selected' | 'watched'

export interface DirectoryTarget {
  targetId: string
  path: string
  displayName: string
  sourceType: SourceType
  isAuthorized?: boolean
  isWatched?: boolean
  lastScannedAt?: string | null
}

export interface ProtectedItem {
  path: string
  reason: string
  protectionType?: 'project_root' | 'workspace' | 'ignored' | 'user_protected'
}

export interface DirectoryProfileSummary {
  directoryType: 'normal_heap' | 'download_heap' | 'desktop_heap' | 'project_container' | 'project_root' | 'mixed'
  estimatedComplexity: 'low' | 'medium' | 'high' | 'very_high'
  recommendedStrategyHint: 'business' | 'category' | 'business_category' | 'protect_only' | 'manual_first'
  note?: string
}

export interface DirectoryProfileScanStats {
  totalFiles: number
  topLevelFiles: number
  subDirectories: number
  estimatedMovableFiles: number
  largeTaskModeSuggested?: boolean
}

export interface DirectoryTypeDistributionItem {
  category: 'table' | 'document' | 'image' | 'presentation' | 'mindmap' | 'archive' | 'installer' | 'audio' | 'video' | 'code' | 'other'
  count: number
}

export interface BusinessSignal {
  category: '运营' | '产品' | '客户' | '调研' | '财务' | '学习' | '项目' | '设计'
  score: number
  matchedKeywords?: string[]
}

export type SceneCategory =
  | '简历'
  | '合同'
  | '发票'
  | '报销材料'
  | 'PRD'
  | '会议纪要'
  | '调研报告'
  | '竞品分析'
  | '作品集'
  | '培训资料'
  | '证件材料'
  | '申请材料'
  | '报价单'
  | '需求文档'
  | '软件安装包'
  | '压缩包'

export interface SceneSignal {
  category: SceneCategory
  score: number
}

export interface FileCluster {
  clusterId: string
  label: string
  fileCount: number
  sampleFiles?: string[]
}

export interface HiddenDirectoryCandidate {
  name: string
  path: string
  suggestedVisibleName?: string
}

export interface DirectoryProfile {
  profileId: string
  target: DirectoryTarget
  summary: DirectoryProfileSummary
  scanStats: DirectoryProfileScanStats
  typeDistribution: DirectoryTypeDistributionItem[]
  businessSignals: BusinessSignal[]
  sceneDistribution?: Array<{ category: SceneCategory; count: number }>
  sceneSignals?: SceneSignal[]
  clusters: FileCluster[]
  protectedItems: ProtectedItem[]
  hiddenDirectoryCandidates?: HiddenDirectoryCandidate[]
  preferenceHits?: string[]
}

export interface FolderPlan {
  folderId: string
  displayName: string
  pathName: string
  folderType: 'business' | 'scenario' | 'category' | 'business_category_parent' | 'business_category_child' | 'uncertain' | 'other'
  parentFolderId?: string | null
  expectedFileCount?: number
}

export interface SceneEvidence {
  source: 'filename' | 'path_context' | 'cluster' | 'content_summary' | 'preference'
  signals: string[]
  signalCount?: number
  primaryReason: string
}

export interface FileMovePlan {
  fileId: string
  fileName: string
  sourcePath: string
  targetFolderId: string
  targetPath: string
  reason: string
  statusHint: 'planned' | 'protected' | 'uncertain' | 'skip'
  sceneCategory?: SceneCategory | null
  sceneKind?: 'semantic' | 'special_package'
  sceneConfidence?: number
  sceneEvidence?: SceneEvidence
  sceneAnalysisUsed?: boolean
}

export interface UncertainFile {
  fileName: string
  sourcePath: string
  reason: string
  sceneCategory?: SceneCategory | null
  sceneKind?: 'semantic' | 'special_package'
  sceneConfidence?: number
  sceneEvidence?: SceneEvidence
  sceneAnalysisUsed?: boolean
}

export interface OrganizationScheme {
  schemeId: string
  schemeType: 'business' | 'category' | 'business_category'
  confidence: number
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low'
  primaryBusinessCategory?: '运营' | '产品' | '客户' | '调研' | '财务' | '学习' | '项目' | '设计' | null
  reasons: string[]
  folders: FolderPlan[]
  moves: FileMovePlan[]
  uncertainFiles: UncertainFile[]
  protectedItems: ProtectedItem[]
  warnings?: string[]
  displayState?: 'actionable' | 'hold_safe' | 'empty_noop'
  isRecommended?: boolean
  rankScore?: number
  uncertainExplanations?: string[]
  dedupGroupSize?: number
  decisionTrace?: {
    mode: 'debug' | 'acceptance'
    entries: DecisionTraceEntry[]
  }
}

export interface DecisionTraceEntry {
  fileId: string
  fileName: string
  sourcePath: string
  objectType: 'scenario_object' | 'business_object' | 'category_object' | 'protected_object' | 'uncertain_object'
  semanticLayer: 'scenario' | 'business' | 'category' | 'protected' | 'uncertain'
  namingSource: 'scenario' | 'business' | 'category' | 'fallback' | 'protected'
  executionAction: 'move' | 'keep' | 'protect'
  downgradeReason?: string | null
  targetFolderId?: string | null
  targetPath?: string | null
}

export interface ExecutionTask {
  taskId: string
  targetPath: string
  schemeId: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  plannedMoveCount: number
  completedMoveCount?: number
  failedMoveCount?: number
  skippedMoveCount?: number
  createdFolders?: string[]
  rollbackMap?: Array<{
    sourcePath: string
    targetPath: string
  }>
  batchInfo?: {
    currentBatch: number
    totalBatches: number
  } | null
  createdAt: string
  finishedAt?: string | null
}

export interface ExecutionReceiptSummary {
  plannedCount: number
  executedCount: number
  successCount: number
  failedCount: number
  skippedCount: number
}

export interface ExecutionReceiptMove {
  fileId: string
  fileName: string
  sourcePath: string
  targetPath: string
  status: 'success' | 'failed' | 'skipped'
  targetFolderName?: string
  reason?: string
  errorCode?: string
  errorMessage?: string
  stillAtOriginalPath?: boolean
  sceneCategory?: SceneCategory | null
  sceneKind?: 'semantic' | 'special_package'
  sceneConfidence?: number
  sceneEvidence?: SceneEvidence
  sceneAnalysisUsed?: boolean
}

export interface ExecutionReceipt {
  taskId: string
  schemeId: string
  targetPath: string
  summary: ExecutionReceiptSummary
  createdFolders: string[]
  moves: ExecutionReceiptMove[]
  scannedCount?: number
  createdAt: string
  finishedAt?: string | null
}

export interface ExecutionCheckpoint {
  taskId: string
  schemeId: string
  targetPath: string
  scannedCount: number
  batchSize: number
  totalBatches: number
  nextPlannedIndex: number
  nonPlannedRecorded: boolean
  uncertainFilesRecorded: boolean
  task: ExecutionTask
  receipt: ExecutionReceipt
  scheme: OrganizationScheme
  updatedAt: string
}

export type VerificationFailedCode =
  | 'SOURCE_NOT_FOUND'
  | 'TARGET_DIR_NOT_FOUND'
  | 'TARGET_DIR_CREATE_FAILED'
  | 'MOVE_FAILED'
  | 'PERMISSION_DENIED'
  | 'FILE_IN_USE'
  | 'PATH_PARSE_ERROR'
  | 'CROSS_VOLUME_MOVE_FAILED'
  | 'SPECIAL_CHAR_PATH_ERROR'
  | 'UNKNOWN_ERROR'

export interface VerificationSuccessFile {
  fileName: string
  sourcePath: string
  targetPath: string
  targetFolderName: string
  reason?: string
  sceneCategory?: SceneCategory | null
  sceneKind?: 'semantic' | 'special_package'
  sceneConfidence?: number
  sceneEvidence?: SceneEvidence
  sceneAnalysisUsed?: boolean
}

export interface VerificationFailedFile {
  fileName: string
  sourcePath: string
  targetPath: string
  errorCode: VerificationFailedCode
  errorMessage: string
  stillAtOriginalPath?: boolean
}

export interface VerificationSkippedFile {
  fileName: string
  sourcePath: string
  reason: string
  sceneCategory?: SceneCategory | null
  sceneKind?: 'semantic' | 'special_package'
  sceneConfidence?: number
  sceneEvidence?: SceneEvidence
  sceneAnalysisUsed?: boolean
}

export interface VerificationReportSummary {
  scannedCount: number
  plannedCount: number
  executedCount: number
  successCount: number
  failedCount: number
  skippedCount: number
}

export interface VerificationReport {
  taskId: string
  summary: VerificationReportSummary
  successFiles: VerificationSuccessFile[]
  failedFiles: VerificationFailedFile[]
  skippedFiles: VerificationSkippedFile[]
  createdFolders: Array<{
    displayName: string
    path: string
  }>
}

export interface PreferenceMemory {
  memoryId: string
  preferences: {
    protectedDirectories?: string[]
    businessTypeOverrides?: Array<{
      filePattern: string
      businessCategory: '运营' | '产品' | '客户' | '调研' | '财务' | '学习' | '项目' | '设计'
    }>
    sceneCategoryOverrides?: Array<{
      filePattern: string
      sceneCategory: SceneCategory
    }>
    preferredSchemeByPath?: Array<{
      path: string
      schemeType: 'business' | 'category' | 'business_category'
    }>
    separateInstallerPackages?: boolean
  }
}
