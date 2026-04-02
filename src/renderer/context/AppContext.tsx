import React, { createContext, useContext, useState, useCallback } from 'react'
import type {
  ModelConfig,
  ScanResult,
  OrganizationScheme,
  OrganizationTask,
  FileInfo,
} from '@shared/types'

interface AppState {
  modelConfig: ModelConfig | null
  scanResult: ScanResult | null
  selectedScheme: OrganizationScheme | null
  adjustedScheme: OrganizationScheme | null
  currentTask: OrganizationTask | null
  taskHistory: OrganizationTask[]
}

interface AppContextType extends AppState {
  setModelConfig: (config: ModelConfig) => void
  setScanResult: (result: ScanResult) => void
  setSelectedScheme: (scheme: OrganizationScheme) => void
  setAdjustedScheme: (scheme: OrganizationScheme) => void
  setCurrentTask: (task: OrganizationTask) => void
  addToHistory: (task: OrganizationTask) => void
  clearCurrentTask: () => void
  updateTaskStatus: (taskId: string, status: OrganizationTask['status']) => void
}

const defaultState: AppState = {
  modelConfig: null,
  scanResult: null,
  selectedScheme: null,
  adjustedScheme: null,
  currentTask: null,
  taskHistory: [],
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState)

  const setModelConfig = useCallback((config: ModelConfig) => {
    setState(prev => ({ ...prev, modelConfig: config }))
  }, [])

  const setScanResult = useCallback((result: ScanResult) => {
    setState(prev => ({ ...prev, scanResult: result }))
  }, [])

  const setSelectedScheme = useCallback((scheme: OrganizationScheme) => {
    setState(prev => ({ ...prev, selectedScheme: scheme }))
  }, [])

  const setAdjustedScheme = useCallback((scheme: OrganizationScheme) => {
    setState(prev => ({ ...prev, adjustedScheme: scheme }))
  }, [])

  const setCurrentTask = useCallback((task: OrganizationTask) => {
    setState(prev => ({ ...prev, currentTask: task }))
  }, [])

  const addToHistory = useCallback((task: OrganizationTask) => {
    setState(prev => ({
      ...prev,
      taskHistory: [task, ...prev.taskHistory].slice(0, 50),
    }))
  }, [])

  const clearCurrentTask = useCallback(() => {
    setState(prev => ({ ...prev, currentTask: null }))
  }, [])

  const updateTaskStatus = useCallback((taskId: string, status: OrganizationTask['status']) => {
    setState(prev => ({
      ...prev,
      taskHistory: prev.taskHistory.map(t =>
        t.taskId === taskId ? { ...t, status } : t
      ),
    }))
  }, [])

  return (
    <AppContext.Provider
      value={{
        ...state,
        setModelConfig,
        setScanResult,
        setSelectedScheme,
        setAdjustedScheme,
        setCurrentTask,
        addToHistory,
        clearCurrentTask,
        updateTaskStatus,
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
