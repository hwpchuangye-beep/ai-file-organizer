import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Monitor, Download, Folder, AlertCircle, CheckCircle, Wrench } from '../components/Icons'
import { useEffect, useState } from 'react'

export default function HomePage() {
  const navigate = useNavigate()
  const { modelConfig, setScanResult } = useApp()
  const [isScanning, setIsScanning] = useState(false)
  
  // 隐藏目录修复
  const [showRepair, setShowRepair] = useState(false)
  const [repairPreview, setRepairPreview] = useState<any[]>([])

  useEffect(() => {
    if (!modelConfig) {
      navigate('/model-config')
    }
  }, [modelConfig, navigate])

  const handleCheckDesktop = async () => {
    if (!window.electronAPI) return
    setIsScanning(true)
    const desktopPath = await window.electronAPI.getDesktopPath()
    const result = await window.electronAPI.scanDirectory(desktopPath)
    if (result.success) {
      const scanResult = analyzeFiles(desktopPath, result.files || [])
      setScanResult(scanResult)
      navigate('/scan-result')
    }
    setIsScanning(false)
  }

  const handleCheckDownloads = async () => {
    if (!window.electronAPI) return
    setIsScanning(true)
    const downloadsPath = await window.electronAPI.getDownloadsPath()
    const result = await window.electronAPI.scanDirectory(downloadsPath)
    if (result.success) {
      const scanResult = analyzeFiles(downloadsPath, result.files || [])
      setScanResult(scanResult)
      navigate('/scan-result')
    }
    setIsScanning(false)
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    const selectedPath = await window.electronAPI.selectDirectory()
    if (selectedPath) {
      setIsScanning(true)
      const result = await window.electronAPI.scanDirectory(selectedPath)
      if (result.success) {
        const scanResult = analyzeFiles(selectedPath, result.files || [])
        setScanResult(scanResult)
        navigate('/scan-result')
      }
      setIsScanning(false)
    }
  }

  const isConnected = modelConfig?.isConnected

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: 'linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1
          style={{
            fontSize: '42px',
            fontWeight: 700,
            marginBottom: '12px',
            background: 'linear-gradient(135deg, #007aff, #5856d6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          AI 文件整理助手
        </h1>
        <p style={{ fontSize: '18px', color: '#6e6e73', maxWidth: '500px' }}>
          智能扫描、分析并整理您的文件，让桌面和下载文件夹保持整洁有序
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '40px',
          padding: '12px 20px',
          background: isConnected ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
          borderRadius: '20px',
        }}
      >
        {isConnected ? (
          <>
            <CheckCircle size={16} color="#34c759" />
            <span style={{ fontSize: '14px', color: '#34c759', fontWeight: 500 }}>
              已连接: {modelConfig?.modelName}
            </span>
          </>
        ) : (
          <>
            <AlertCircle size={16} color="#ff3b30" />
            <span style={{ fontSize: '14px', color: '#ff3b30', fontWeight: 500 }}>
              模型未连接
            </span>
          </>
        )}
        <button
          onClick={() => navigate('/model-config')}
          style={{
            marginLeft: '8px',
            padding: '4px 12px',
            fontSize: '13px',
            background: 'transparent',
            border: '1px solid currentColor',
            borderRadius: '12px',
            cursor: 'pointer',
            color: isConnected ? '#34c759' : '#ff3b30',
          }}
        >
          {isConnected ? '切换模型' : '去配置'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '900px' }}>
        <ActionCard
          icon={<Monitor size={32} color="#007aff" />}
          title="检查我的桌面"
          description="扫描桌面文件，识别堆积和混乱"
          onClick={handleCheckDesktop}
          disabled={!isConnected || isScanning}
        />
        <ActionCard
          icon={<Download size={32} color="#34c759" />}
          title="整理下载文件夹"
          description="清理下载目录，分类归档文件"
          onClick={handleCheckDownloads}
          disabled={!isConnected || isScanning}
        />
        <ActionCard
          icon={<Folder size={32} color="#5856d6" />}
          title="选择文件夹开始"
          description="手动选择任意文件夹进行整理"
          onClick={handleSelectFolder}
          disabled={!isConnected || isScanning}
        />
      </div>

      {isScanning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '32px 48px',
              borderRadius: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '3px solid #e3e3e8',
                borderTopColor: '#007aff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ fontSize: '16px', fontWeight: 500 }}>正在扫描文件...</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}

function ActionCard({ icon, title, description, onClick, disabled }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 24px',
        background: 'white',
        border: 'none',
        borderRadius: '16px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        minWidth: '220px',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.08)'
      }}
    >
      <div style={{ marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '14px', color: '#6e6e73', textAlign: 'center' }}>{description}</p>
    </button>
  )
}

function analyzeFiles(targetPath: string, files: any[]) {
  const issueSummary = {
    screenshotsCount: 0,
    downloadsCount: 0,
    similarFilesCount: 0,
    scatteredProjectFiles: 0,
    namingIssuesCount: 0,
  }

  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.heic']
  const downloadExts = ['.zip', '.rar', '.7z', '.dmg', '.pkg', '.exe', '.msi']

  files.forEach(file => {
    if (imageExts.includes(file.extension)) {
      issueSummary.screenshotsCount++
    }
    if (downloadExts.includes(file.extension)) {
      issueSummary.downloadsCount++
    }
    if (/screenshot|截屏|屏幕截图/i.test(file.name)) {
      issueSummary.screenshotsCount++
    }
  })

  const issueTags: string[] = []
  if (issueSummary.screenshotsCount > 5) issueTags.push('截图堆积')
  if (issueSummary.downloadsCount > 5) issueTags.push('下载文件堆积')
  if (files.length > 20) issueTags.push('文件数量较多')

  return {
    targetPath,
    totalFiles: files.length,
    analyzableFiles: files.length,
    files,
    issueSummary,
    issueTags,
    riskFlags: [],
  }
}
