import type {
  ModelConfig,
  DirectoryProfile,
  OrganizationScheme,
  ExecutionTask,
  ExecutionReceipt,
  ExecutionCheckpoint,
  VerificationReport,
  PreferenceMemory,
} from '@shared/types'

declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>
      getDesktopPath: () => Promise<string>
      getDownloadsPath: () => Promise<string>
      scanDirectory: (path: string, options?: { projectProtection?: boolean }) => Promise<any>

      showInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
      openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>

      testModelConnection: (config: { baseUrl: string; apiKey?: string }) => Promise<{ success: boolean; message?: string; models?: string[] }>
      getModels: (config: { baseUrl: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; message?: string }>

      getLatestTask: () => Promise<any | null>
      getTaskHistory: () => Promise<any[]>
      rollbackLatestTask: () => Promise<any>

      detectHiddenDirectories: (targetPath: string) => Promise<{ success: boolean; hiddenDirs?: any[]; error?: string }>
      generateRepairPreview: (targetPath: string) => Promise<{ success: boolean; preview?: any[]; hiddenCount?: number; message?: string; error?: string }>
      repairHiddenDirectories: (targetPath: string) => Promise<{ success: boolean; repaired?: any[]; failed?: any[]; message?: string; error?: string }>

      // Skill V2
      buildDirectoryProfile: (payload: { targetPath: string; sourceType: 'desktop' | 'downloads' | 'user_selected' | 'watched'; watched?: boolean }) => Promise<{ success: boolean; profile?: DirectoryProfile; error?: string; validationErrors?: any[] }>
      generateOrganizationSchemes: (payload: { profileId: string; modelConfig?: ModelConfig | null }) => Promise<{
        success: boolean
        recommendedSchemeId?: string | null
        schemes?: OrganizationScheme[]
        plannerSource?: 'model' | 'rules'
        plannerModel?: string | null
        plannerMessage?: string
        error?: string
        validationErrors?: any[]
      }>
      approveOrganizationScheme: (payload: { schemeId: string; schemeOverride?: OrganizationScheme }) => Promise<{ success: boolean; schemeId?: string; scheme?: OrganizationScheme; error?: string; validationErrors?: any[] }>
      executeApprovedScheme: (payload: { schemeId: string; taskId?: string; batchSize?: number; maxBatchesPerRun?: number }) => Promise<{ success: boolean; task?: ExecutionTask; receipt?: ExecutionReceipt; paused?: boolean; hasRemaining?: boolean; error?: string }>
      resumeExecutionTask: (payload: { taskId: string; maxBatchesPerRun?: number }) => Promise<{ success: boolean; task?: ExecutionTask; receipt?: ExecutionReceipt; paused?: boolean; hasRemaining?: boolean; error?: string }>
      getExecutionCheckpoint: (payload: { taskId: string }) => Promise<{ success: boolean; checkpoint?: ExecutionCheckpoint | null; error?: string }>
      verifyExecutionTask: (payload: { taskId: string }) => Promise<{ success: boolean; report?: VerificationReport; error?: string; validationErrors?: any[] }>

      getPreferenceMemory: () => Promise<{ success: boolean; memory?: PreferenceMemory; error?: string }>
      savePreferenceMemory: (payload: { memory: PreferenceMemory }) => Promise<{ success: boolean; memory?: PreferenceMemory; error?: string; validationErrors?: any[] }>
      updatePreferenceMemory: (payload: { patch: Partial<PreferenceMemory['preferences']> }) => Promise<{ success: boolean; memory?: PreferenceMemory; error?: string; validationErrors?: any[] }>
    }
  }
}

export {}
