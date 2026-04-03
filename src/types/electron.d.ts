declare global {
  interface Window {
    electronAPI?: Record<string, (...args: any[]) => Promise<any>>
  }
}

export {}
