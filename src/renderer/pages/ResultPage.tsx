import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  CheckCircle,
  Folder,
  FileText,
  Home,
  AlertCircle,
  ExternalLink,
  Eye,
} from '../components/Icons'

export default function ResultPage() {
  const navigate = useNavigate()
  const { currentTask, verificationReport, clearExecutionState } = useApp()
  const [openingFile, setOpeningFile] = useState<string | null>(null)
  const [openingFolder, setOpeningFolder] = useState<string | null>(null)
  const successFiles = verificationReport?.successFiles ?? []
  const failedFiles = verificationReport?.failedFiles ?? []
  const skippedFiles = verificationReport?.skippedFiles ?? []
  const createdFolders = verificationReport?.createdFolders ?? []

  useEffect(() => {
    if (!currentTask || !verificationReport) {
      navigate('/', { replace: true })
    }
  }, [currentTask, verificationReport, navigate])

  const successByFolder = useMemo(() => {
    const acc: Record<string, typeof successFiles> = {}
    for (const file of successFiles) {
      if (!acc[file.targetFolderName]) acc[file.targetFolderName] = []
      acc[file.targetFolderName].push(file)
    }
    return acc
  }, [successFiles])

  const sceneSummary = useMemo(() => {
    const successHit = successFiles.filter((file) => Boolean(file.sceneCategory)).length
    const successDowngraded = successFiles.length - successHit
    const skippedHold = skippedFiles.length
    return { successHit, successDowngraded, skippedHold }
  }, [successFiles, skippedFiles])

  const handleShowInFolder = async (filePath: string) => {
    if (!window.electronAPI) return
    setOpeningFile(filePath)
    await window.electronAPI.showInFolder(filePath)
    setOpeningFile(null)
  }

  const handleOpenFolder = async (folderPath: string) => {
    if (!window.electronAPI) return
    setOpeningFolder(folderPath)
    await window.electronAPI.openFolder(folderPath)
    setOpeningFolder(null)
  }

  const handleFinish = () => {
    clearExecutionState()
    navigate('/')
  }

  if (!currentTask || !verificationReport) return null

  return (
    <div className="page-container" style={{ maxHeight: '100vh', overflow: 'auto' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(52, 199, 89, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <CheckCircle size={40} color="#34c759" />
      </div>

      <h1 className="page-title" style={{ textAlign: 'center' }}>整理完成</h1>
      <p className="page-subtitle" style={{ textAlign: 'center' }}>结果来自验证器逐文件落盘校验</p>

      <div className="grid grid-3" style={{ maxWidth: '800px', margin: '0 auto 24px' }}>
        <StatCard icon={<FileText size={24} color="#34c759" />} value={verificationReport.summary.successCount} label="成功" />
        <StatCard icon={<AlertCircle size={24} color="#ff3b30" />} value={verificationReport.summary.failedCount} label="失败" />
        <StatCard icon={<FileText size={24} color="#6e6e73" />} value={verificationReport.summary.skippedCount} label="跳过" />
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>场景解释摘要（来自验证结果）</h3>
        <div style={{ fontSize: '13px', color: '#1d1d1f', marginBottom: '8px' }}>
          场景命中并执行成功：{sceneSummary.successHit}
        </div>
        <div style={{ fontSize: '13px', color: '#6e6e73', marginBottom: '8px' }}>
          场景降级后执行成功：{sceneSummary.successDowngraded}
        </div>
        <div style={{ fontSize: '13px', color: '#b26a00' }}>
          保持原位（跳过/待确认）：{sceneSummary.skippedHold}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>成功文件去向</h3>
        {Object.entries(successByFolder).map(([folderName, files]) => (
          <div key={folderName} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{folderName} ({files.length})</div>
              <button
                onClick={() => handleOpenFolder(files[0]?.targetPath.replace(/\/[^/]+$/, '') || '')}
                disabled={openingFolder !== null}
                style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#007aff20', color: '#007aff', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ExternalLink size={12} />
                打开文件夹
              </button>
            </div>
            {files.slice(0, 10).map((file) => (
              <div key={`${file.sourcePath}->${file.targetPath}`} style={{ padding: '10px', borderRadius: '8px', background: '#f5f5f7', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{file.fileName}</div>
                <div style={{ fontSize: '11px', color: '#6e6e73', marginBottom: '3px', wordBreak: 'break-all' }}>原路径: {file.sourcePath}</div>
                <div style={{ fontSize: '11px', color: '#007aff', marginBottom: '8px', wordBreak: 'break-all' }}>新路径: {file.targetPath}</div>
                <SceneExplanation
                  sceneCategory={file.sceneCategory}
                  sceneConfidence={file.sceneConfidence}
                  sceneEvidence={file.sceneEvidence}
                  sceneAnalysisUsed={file.sceneAnalysisUsed}
                  fallbackReason={file.reason}
                  tone="success"
                />
                <button
                  onClick={() => handleShowInFolder(file.targetPath)}
                  disabled={openingFile === file.targetPath}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#007aff20', color: '#007aff', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Eye size={12} />
                  在 Finder 中显示
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>失败明细</h3>
        {failedFiles.length === 0 && (
          <div style={{ fontSize: '13px', color: '#34c759' }}>无失败文件</div>
        )}
        {failedFiles.map((file) => (
          <div key={`${file.sourcePath}->${file.targetPath}`} style={{ padding: '10px', borderRadius: '8px', background: '#ff3b3010', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{file.fileName}</div>
            <div style={{ fontSize: '11px', color: '#6e6e73', wordBreak: 'break-all' }}>原路径: {file.sourcePath}</div>
            <div style={{ fontSize: '11px', color: '#6e6e73', wordBreak: 'break-all' }}>目标路径: {file.targetPath}</div>
            <div style={{ fontSize: '12px', color: '#ff3b30', marginTop: '4px' }}>{file.errorCode}: {file.errorMessage}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>待确认 / 跳过文件</h3>
        {skippedFiles.length === 0 && (
          <div style={{ fontSize: '13px', color: '#34c759' }}>无待确认或跳过文件</div>
        )}
        {skippedFiles.map((file) => (
          <div key={`${file.sourcePath}:${file.fileName}`} style={{ padding: '10px', borderRadius: '8px', background: '#fff7e6', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{file.fileName}</div>
            <div style={{ fontSize: '11px', color: '#6e6e73', wordBreak: 'break-all' }}>原路径: {file.sourcePath}</div>
            <div style={{ fontSize: '12px', color: '#b26a00', marginTop: '4px' }}>原因: {file.reason}</div>
            <SceneExplanation
              sceneCategory={file.sceneCategory}
              sceneConfidence={file.sceneConfidence}
              sceneEvidence={file.sceneEvidence}
              sceneAnalysisUsed={file.sceneAnalysisUsed}
              fallbackReason={file.reason}
              tone="skipped"
            />
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>本次新建目录</h3>
        {createdFolders.length === 0 && (
          <div style={{ fontSize: '13px', color: '#6e6e73' }}>本次未新建目录</div>
        )}
        {createdFolders.map((folder) => (
          <div key={folder.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <Folder size={14} color="#007aff" />
              {folder.path}
            </div>
            <button
              onClick={() => handleOpenFolder(folder.path)}
              disabled={openingFolder === folder.path}
              style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#007aff20', color: '#007aff', fontSize: '11px' }}
            >
              打开
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '40px' }}>
        <button className="btn btn-primary" onClick={handleFinish}>
          <Home size={18} />
          <span>返回首页</span>
        </button>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '14px', color: '#6e6e73' }}>{label}</div>
    </div>
  )
}

function SceneExplanation({
  sceneCategory,
  sceneConfidence,
  sceneEvidence,
  sceneAnalysisUsed,
  fallbackReason,
  tone,
}: {
  sceneCategory?: string | null
  sceneConfidence?: number
  sceneEvidence?: { source: string; signals: string[]; primaryReason: string } | undefined
  sceneAnalysisUsed?: boolean
  fallbackReason?: string
  tone: 'success' | 'skipped'
}) {
  if (sceneCategory) {
    return (
      <div style={{ marginBottom: '8px', fontSize: '11px', color: '#0a7c40' }}>
        <div>
          场景命中：{sceneCategory}
          {typeof sceneConfidence === 'number' ? `（${Math.round(sceneConfidence * 100)}%）` : ''}
          {sceneAnalysisUsed ? ' · 使用轻内容摘要' : ''}
        </div>
        {sceneEvidence && (
          <div style={{ color: '#4b5563' }}>
            证据：{sceneEvidence.source} · {(sceneEvidence.signals || []).slice(0, 3).join('、')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '8px', fontSize: '11px', color: tone === 'skipped' ? '#b26a00' : '#6e6e73' }}>
      {tone === 'skipped'
        ? `保持原位：${fallbackReason || '未命中场景阈值，待确认处理'}`
        : `场景降级：${fallbackReason || '未命中场景阈值，已按业务/类别整理'}`}
    </div>
  )
}
