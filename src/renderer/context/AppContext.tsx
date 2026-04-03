import React, { createContext, useContext, useState, useCallback } from 'react'
import type {
  ModelConfig,
  DirectoryProfile,
  OrganizationScheme,
  ExecutionTask,
  ExecutionReceipt,
  VerificationReport,
} from '@shared/types'

interface AppState {
  modelConfig: ModelConfig | null
  directoryProfile: DirectoryProfile | null
  schemes: OrganizationScheme[]
  selectedScheme: OrganizationScheme | null
  adjustedScheme: OrganizationScheme | null
  approvedSchemeId: string | null
  currentTask: ExecutionTask | null
  currentReceipt: ExecutionReceipt | null
  verificationReport: VerificationReport | null
  taskHistory: ExecutionTask[]
}

interface AppContextType extends AppState {
  setModelConfig: (config: ModelConfig) => void
  setDirectoryProfile: (profile: DirectoryProfile) => void
  setSchemes: (schemes: OrganizationScheme[]) => void
  setSelectedScheme: (scheme: OrganizationScheme) => void
  setAdjustedScheme: (scheme: OrganizationScheme) => void
  setApprovedSchemeId: (schemeId: string | null) => void
  setCurrentTask: (task: ExecutionTask) => void
  setCurrentReceipt: (receipt: ExecutionReceipt | null) => void
  setVerificationReport: (report: VerificationReport | null) => void
  addToHistory: (task: ExecutionTask) => void
  clearExecutionState: () => void
}

const defaultState: AppState = {
  modelConfig: null,
  directoryProfile: null,
  schemes: [],
  selectedScheme: null,
  adjustedScheme: null,
  approvedSchemeId: null,
  currentTask: null,
  currentReceipt: null,
  verificationReport: null,
  taskHistory: [],
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState)

  const setModelConfig = useCallback((config: ModelConfig) => {
    setState((prev) => ({ ...prev, modelConfig: config }))
  }, [])

  const setDirectoryProfile = useCallback((profile: DirectoryProfile) => {
    setState((prev) => ({ ...prev, directoryProfile: profile }))
  }, [])

  const setSchemes = useCallback((schemes: OrganizationScheme[]) => {
    setState((prev) => ({ ...prev, schemes }))
  }, [])

  const setSelectedScheme = useCallback((scheme: OrganizationScheme) => {
    setState((prev) => ({ ...prev, selectedScheme: scheme }))
  }, [])

  const setAdjustedScheme = useCallback((scheme: OrganizationScheme) => {
    setState((prev) => ({ ...prev, adjustedScheme: scheme }))
  }, [])

  const setApprovedSchemeId = useCallback((schemeId: string | null) => {
    setState((prev) => ({ ...prev, approvedSchemeId: schemeId }))
  }, [])

  const setCurrentTask = useCallback((task: ExecutionTask) => {
    setState((prev) => ({ ...prev, currentTask: task }))
  }, [])

  const setCurrentReceipt = useCallback((receipt: ExecutionReceipt | null) => {
    setState((prev) => ({ ...prev, currentReceipt: receipt }))
  }, [])

  const setVerificationReport = useCallback((report: VerificationReport | null) => {
    setState((prev) => ({ ...prev, verificationReport: report }))
  }, [])

  const addToHistory = useCallback((task: ExecutionTask) => {
    setState((prev) => ({
      ...prev,
      taskHistory: [task, ...prev.taskHistory].slice(0, 50),
    }))
  }, [])

  const clearExecutionState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      approvedSchemeId: null,
      currentTask: null,
      currentReceipt: null,
      verificationReport: null,
    }))
  }, [])

  return (
    <AppContext.Provider
      value={{
        ...state,
        setModelConfig,
        setDirectoryProfile,
        setSchemes,
        setSelectedScheme,
        setAdjustedScheme,
        setApprovedSchemeId,
        setCurrentTask,
        setCurrentReceipt,
        setVerificationReport,
        addToHistory,
        clearExecutionState,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
