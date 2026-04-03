import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ArrowRight, ChevronLeft, Folder, FileText, AlertCircle, MapPin } from '../components/Icons'
import { useEffect, useMemo, useState } from 'react'

export default function ExecuteConfirmPage() {
  const navigate = useNavigate()
  const { adjustedScheme, directoryProfile, setApprovedSchemeId } = useApp()
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const folders = adjustedScheme?.folders ?? []
  const moves = adjustedScheme?.moves ?? []
  const uncertainFiles = adjustedScheme?.uncertainFiles ?? []

  useEffect(() => {
    if (!adjustedScheme || !directoryProfile) {
      navigate('/scheme-adjust', { replace: true })
    }
  }, [adjustedScheme, directoryProfile, navigate])

  const folderMap = useMemo(() => {
    const map = new Map<string, string>()
    folders.forEach((folder) => map.set(folder.folderId, folder.displayName))
    return map
  }, [folders])

  const filesByFolder = useMemo(() => {
    const acc: Record<string, typeof moves> = {}
    for (const move of moves) {
      if (move.statusHint !== 'planned') continue
      if (!acc[move.targetFolderId]) acc[move.targetFolderId] = []
      acc[move.targetFolderId].push(move)
    }
    return acc
  }, [moves])

  const plannedMoves = moves.filter((m) => m.statusHint === 'planned')
  const uncertainCount = uncertainFiles.length
  const sceneHitPlannedCount = plannedMoves.filter((move) => Boolean(move.sceneCategory)).length
  const sceneDowngradedPlannedCount = plannedMoves.filter((move) => !move.sceneCategory).length

  const handleApproveAndExecute = async () => {
    if (!window.electronAPI || !adjustedScheme) return
    setApproving(true)
    setError(null)

    const approveResult = await window.electronAPI.approveOrganizationScheme({
      schemeId: adjustedScheme.schemeId,
      schemeOverride: adjustedScheme,
    })

    if (!approveResult.success || !approveResult.schemeId) {
      setError(approveResult.error || '审批失败')
      setApproving(false)
      return
    }

    setApprovedSchemeId(approveResult.schemeId)
    setApproving(false)
    navigate('/executing')
  }

  if (!adjustedScheme || !directoryProfile) return null

  return (
    <div className="page-container">
      <h1 className="page-title">执行确认</h1>
      <p className="page-subtitle">后端审批通过后才允许进入执行器</p>

      <div className="grid grid-3" style={{ marginBottom: '24px' }}>
        <StatCard icon={<Folder size={24} color="#007aff" />} value={adjustedScheme.folders.length} label="新建文件夹" />
        <StatCard icon={<FileText size={24} color="#34c759" />} value={plannedMoves.length} label="计划移动" />
        <StatCard icon={<AlertCircle size={24} color="#ff9500" />} value={uncertainCount} label="待确认文件" />
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>场景解释摘要</h3>
        <div style={{ fontSize: '13px', color: '#1d1d1f', marginBottom: '8px' }}>
          场景命中：{sceneHitPlannedCount} 个文件
        </div>
        <div style={{ fontSize: '13px', color: '#6e6e73', marginBottom: '8px' }}>
          场景降级：{sceneDowngradedPlannedCount} 个文件（未达场景阈值，已按业务/类别落位）
        </div>
        <div style={{ fontSize: '13px', color: '#b26a00' }}>
          保持原位：{uncertainCount} 个文件（待确认，未自动移动）
        </div>
      </div>

      <div style={{
        padding: '16px',
        background: 'rgba(0, 122, 255, 0.05)',
        borderRadius: '8px',
        marginBottom: '24px',
        border: '1px solid rgba(0, 122, 255, 0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <MapPin size={16} color="#007aff" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1d1d1f' }}>整理目标目录</span>
        </div>
        <div style={{ fontSize: '14px', color: '#007aff', wordBreak: 'break-all', paddingLeft: '24px' }}>
          {directoryProfile.target.path}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>目录计划</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {adjustedScheme.folders.map((folder) => (
            <span key={folder.folderId} style={{ padding: '6px 10px', borderRadius: '6px', background: '#f5f5f7', fontSize: '13px' }}>
              {folder.displayName}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>文件去向预览</h3>
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {Object.keys(filesByFolder).length === 0 && (
            <div style={{ fontSize: '13px', color: '#6e6e73' }}>本方案无自动移动文件</div>
          )}
          {Object.entries(filesByFolder).map(([folderId, moves]) => (
            <div key={folderId} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                {folderMap.get(folderId) || folderId} ({moves.length})
              </div>
              {moves.slice(0, 6).map((move) => (
                <div key={move.fileId} style={{ fontSize: '12px', color: '#6e6e73', marginBottom: '4px' }}>
                  <div>{move.fileName} → {move.targetPath}</div>
                  <SceneExplanation
                    sceneCategory={move.sceneCategory}
                    sceneConfidence={move.sceneConfidence}
                    sceneEvidence={move.sceneEvidence}
                    sceneAnalysisUsed={move.sceneAnalysisUsed}
                    fallbackReason={move.reason}
                    tone="planned"
                  />
                </div>
              ))}
              {moves.length > 6 && <div style={{ fontSize: '12px', color: '#9ca3af' }}>还有 {moves.length - 6} 个文件...</div>}
            </div>
          ))}
        </div>
      </div>

      {uncertainCount > 0 && (
        <div className="card" style={{ marginBottom: '24px', border: '1px solid #ff950040', background: '#fffaf0' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>待确认文件（未自动移动）</h3>
          <div style={{ fontSize: '13px', color: '#6e6e73', marginBottom: '10px' }}>
            这些文件将保持原路径，等待你后续手动确认。
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {uncertainFiles.slice(0, 15).map((file) => (
              <div key={`${file.sourcePath}:${file.fileName}`} style={{ padding: '8px 0', borderBottom: '1px solid #f0e6d6' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{file.fileName}</div>
                <div style={{ fontSize: '11px', color: '#6e6e73', wordBreak: 'break-all' }}>{file.sourcePath}</div>
                <div style={{ fontSize: '11px', color: '#b26a00' }}>{file.reason}</div>
                <SceneExplanation
                  sceneCategory={file.sceneCategory}
                  sceneConfidence={file.sceneConfidence}
                  sceneEvidence={file.sceneEvidence}
                  sceneAnalysisUsed={file.sceneAnalysisUsed}
                  fallbackReason={file.reason}
                  tone="uncertain"
                />
              </div>
            ))}
            {uncertainFiles.length > 15 && (
              <div style={{ fontSize: '12px', color: '#9ca3af', paddingTop: '8px' }}>
                还有 {uncertainFiles.length - 15} 个待确认文件...
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: '#ff3b3020', color: '#ff3b30', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/scheme-adjust')}>
          <ChevronLeft size={18} />
          <span>返回调整</span>
        </button>
        <button className="btn btn-primary" onClick={handleApproveAndExecute} disabled={approving}>
          <span>{approving ? '审批中...' : '审批并开始整理'}</span>
          <ArrowRight size={18} />
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
  tone: 'planned' | 'uncertain'
}) {
  if (sceneCategory) {
    return (
      <div style={{ marginTop: '4px', fontSize: '11px', color: '#0a7c40' }}>
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
    <div style={{ marginTop: '4px', fontSize: '11px', color: tone === 'uncertain' ? '#b26a00' : '#6e6e73' }}>
      {tone === 'uncertain'
        ? `保持原位：${fallbackReason || '未命中场景阈值，待确认处理'}`
        : `场景降级：${fallbackReason || '未命中场景阈值，已按业务/类别整理'}`}
    </div>
  )
}
