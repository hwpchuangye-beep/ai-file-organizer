import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import {
  CheckCircle,
  Folder,
  FileText,
  RefreshCw,
  Home,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileX,
  ShieldAlert,
  HardDrive,
  Lock,
  FolderX,
  HelpCircle,
  Check,
} from '../components/Icons'
import type { FailedFile, FailedFileErrorCode, OrganizationTask } from '../../shared/types'

// 扩展错误码配置
const errorCodeConfig: Record<
  FailedFileErrorCode,
  { label: string; icon: React.ReactNode; color: string }
> = {
  DUPLICATE_NAME: { label: '重名冲突', icon: <FileX size={16} />, color: '#f59e0b' },
  PERMISSION_DENIED: { label: '权限不足', icon: <ShieldAlert size={16} />, color: '#ef4444' },
  SOURCE_NOT_FOUND: { label: '源文件不存在', icon: <HelpCircle size={16} />, color: '#6b7280' },
  TARGET_DIR_NOT_FOUND: { label: '目标目录不存在', icon: <FolderX size={16} />, color: '#dc2626' },
  TARGET_DIR_CREATE_FAILED: { label: '目录创建失败', icon: <FolderX size={16} />, color: '#dc2626' },
  MOVE_FAILED: { label: '移动失败', icon: <FileX size={16} />, color: '#f97316' },
  FILE_LOCKED: { label: '文件被占用', icon: <Lock size={16} />, color: '#f97316' },
  CROSS_VOLUME_MOVE: { label: '跨卷移动', icon: <HardDrive size={16} />, color: '#8b5cf6' },
  CROSS_VOLUME_FAILED: { label: '跨卷移动失败', icon: <HardDrive size={16} />, color: '#8b5cf6' },
  INVALID_PATH: { label: '无效路径', icon: <AlertCircle size={16} />, color: '#ec4899' },
  INVALID_PATH_CHARS: { label: '非法字符', icon: <AlertCircle size={16} />, color: '#ec4899' },
  DISK_FULL: { label: '磁盘空间不足', icon: <HardDrive size={16} />, color: '#dc2626' },
  DIR_NOT_EMPTY: { label: '目录不为空', icon: <FolderX size={16} />, color: '#f59e0b' },
  IS_DIRECTORY: { label: '目标是目录', icon: <FolderX size={16} />, color: '#f59e0b' },
  NOT_DIRECTORY: { label: '路径不是目录', icon: <FolderX size={16} />, color: '#f59e0b' },
  READONLY_FS: { label: '只读文件系统', icon: <ShieldAlert size={16} />, color: '#ef4444' },
  NAME_TOO_LONG: { label: '文件名过长', icon: <AlertCircle size={16} />, color: '#ec4899' },
  PATH_NOT_FOUND: { label: '路径不存在', icon: <HelpCircle size={16} />, color: '#6b7280' },
  UNKNOWN: { label: '未知错误', icon: <HelpCircle size={16} />, color: '#6b7280' },
}

export default function ResultPage() {
  const navigate = useNavigate()
  const { currentTask, clearCurrentTask } = useApp()
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoResult, setUndoResult] = useState<{ success: boolean; message: string } | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [copiedDetail, setCopiedDetail] = useState(false)
  const [showStatsDetail, setShowStatsDetail] = useState(false)

  if (!currentTask) {
    navigate('/')
    return null
  }

  // 获取统计信息
  const stats = currentTask.stats || {
    scanned: currentTask.movedFiles.length + currentTask.failedFiles.length + currentTask.skippedFiles.length,
    planned: currentTask.movedFiles.length + currentTask.failedFiles.length,
    attempted: currentTask.movedFiles.length + currentTask.failedFiles.length,
    succeeded: currentTask.movedFiles.length,
    failed: currentTask.failedFiles.length,
    skipped: currentTask.skippedFiles.length,
  }

  // 按错误类型分组失败文件
  const groupedFailedFiles = currentTask.failedFiles.reduce(
    (acc, file) => {
      const code = file.errorCode || 'UNKNOWN'
      if (!acc[code]) acc[code] = []
      acc[code].push(file)
      return acc
    },
    {} as Record<string, FailedFile[]>
  )

  const handleUndo = async () => {
    setIsUndoing(true)
    setUndoResult(null)
    try {
      if (!window.electronAPI) {
        setUndoResult({ success: false, message: 'Electron API 未初始化' })
        setIsUndoing(false)
        return
      }
      const result = await window.electronAPI.rollbackLatestTask()
      setUndoResult({
        success: result.success,
        message: result.message || (result.success ? '撤销成功' : '撤销失败'),
      })
      if (result.success) {
        setTimeout(() => {
          clearCurrentTask()
          navigate('/')
        }, 2000)
      }
    } catch (err) {
      setUndoResult({ success: false, message: '撤销过程中发生错误' })
    }
    setIsUndoing(false)
  }

  const handleFinish = () => {
    clearCurrentTask()
    navigate('/')
  }

  const toggleErrorGroup = (errorCode: string) => {
    const newExpanded = new Set(expandedErrors)
    if (newExpanded.has(errorCode)) newExpanded.delete(errorCode)
    else newExpanded.add(errorCode)
    setExpandedErrors(newExpanded)
  }

  const copyFailedDetails = () => {
    const lines: string[] = []
    lines.push(`文件整理执行报告 - ${new Date().toLocaleString()}`)
    lines.push('')
    lines.push('【执行统计】')
    lines.push(`扫描总数: ${stats.scanned}`)
    lines.push(`计划处理: ${stats.planned}`)
    lines.push(`实际尝试: ${stats.attempted}`)
    lines.push(`成功: ${stats.succeeded}`)
    lines.push(`失败: ${stats.failed}`)
    lines.push(`跳过: ${stats.skipped}`)
    if (stats.consistency) {
      lines.push(`统计一致性: ${stats.consistency.totalMatches ? '通过' : '不通过 (差异 ' + stats.consistency.discrepancy + ')'}`)
    }
    lines.push('')
    lines.push(`【失败明细】总计 ${currentTask.failedFiles.length} 个文件失败`)
    lines.push('')

    Object.entries(groupedFailedFiles).forEach(([code, files]) => {
      const config = errorCodeConfig[code as FailedFileErrorCode]
      lines.push(`【${config.label}】(${files.length} 个)`)
      files.forEach((file) => {
        lines.push(`  文件名: ${file.name || file.source.split('/').pop()}`)
        lines.push(`  原路径: ${file.source}`)
        if (file.target) lines.push(`  目标路径: ${file.target}`)
        lines.push(`  失败原因: ${file.reason}`)
        if (file.originalError) lines.push(`  原始错误: ${file.originalError}`)
        if (file.suggestion) lines.push(`  建议操作: ${file.suggestion}`)
        lines.push(`  文件状态: ${file.existsInSource ? '仍存在于原位置' : '已不在原位置'}`)
        lines.push('')
      })
    })

    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedDetail(true)
    setTimeout(() => setCopiedDetail(false), 2000)
  }

  const expandAll = () => setExpandedErrors(new Set(Object.keys(groupedFailedFiles)))
  const collapseAll = () => setExpandedErrors(new Set())

  return (
    <div className="page-container" style={{ textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(52, 199, 89, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <CheckCircle size={40} color="#34c759" />
      </div>

      <h1 className="page-title">整理完成！</h1>
      <p className="page-subtitle">您的文件已按方案整理完成</p>

      {/* 执行统计卡片 */}
      <div className="grid grid-3" style={{ maxWidth: '700px', margin: '0 auto 24px' }}>
        <StatCard icon={<Folder size={24} color="#007aff" />} value={currentTask.createdFolders.length} label="新建文件夹" />
        <StatCard icon={<FileText size={24} color="#34c759" />} value={stats.succeeded} label="成功移动" />
        <StatCard icon={<FileText size={24} color="#6e6e73" />} value={stats.skipped} label="跳过" />
      </div>

      {/* 详细统计信息 */}
      <div style={{ maxWidth: '700px', margin: '0 auto 24px', textAlign: 'left' }}>
        <button
          onClick={() => setShowStatsDetail(!showStatsDetail)}
          style={{
            width: '100%',
            padding: '16px 20px',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <HelpCircle size={20} color="#007aff" />
            <span style={{ fontSize: '15px', fontWeight: 600 }}>执行统计详情</span>
            {stats.consistency && !stats.consistency.totalMatches && (
              <span style={{ fontSize: '12px', color: '#ff3b30', background: 'rgba(255,59,48,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                统计不一致
              </span>
            )}
          </div>
          {showStatsDetail ? <ChevronUp size={20} color="#6e6e73" /> : <ChevronDown size={20} color="#6e6e73" />}
        </button>

        {showStatsDetail && (
          <div style={{ marginTop: '12px', padding: '20px', background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <StatRow label="扫描到的文件数" value={stats.scanned} description="扫描阶段发现的文件总数" />
              <StatRow label="计划处理数" value={stats.planned} description="方案中计划要处理的文件数" />
              <StatRow label="实际尝试数" value={stats.attempted} description="实际执行移动操作的文件数" />
              <StatRow label="成功移动" value={stats.succeeded} color="#34c759" />
              <StatRow label="失败" value={stats.failed} color={stats.failed > 0 ? '#ff3b30' : undefined} />
              <StatRow label="跳过" value={stats.skipped} />
            </div>
            {stats.consistency && (
              <div style={{ marginTop: '16px', padding: '12px', background: stats.consistency.totalMatches ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', borderRadius: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: stats.consistency.totalMatches ? '#34c759' : '#ff3b30' }}>
                  统计一致性: {stats.consistency.totalMatches ? '✓ 通过' : '✗ 不通过'}
                </div>
                <div style={{ fontSize: '12px', color: '#6e6e73', marginTop: '4px' }}>
                  尝试数: {stats.consistency.attempted} | 已统计: {stats.consistency.accounted} | 差异: {stats.consistency.discrepancy}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 失败文件明细 */}
      {currentTask.failedFiles.length > 0 && (
        <div style={{ maxWidth: '700px', margin: '0 auto 24px', borderRadius: '12px', background: '#fff', border: '1px solid rgba(255, 59, 48, 0.2)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: 'rgba(255, 59, 48, 0.05)', borderBottom: '1px solid rgba(255, 59, 48, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={22} color="#ff3b30" />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#ff3b30' }}>
                  {currentTask.failedFiles.length} 个文件处理失败
                </div>
                <div style={{ fontSize: '12px', color: '#6e6e73', marginTop: '2px' }}>
                  分为 {Object.keys(groupedFailedFiles).length} 类错误
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={expandAll} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', background: 'rgba(0, 122, 255, 0.1)', color: '#007aff', cursor: 'pointer' }}>全部展开</button>
              <button onClick={collapseAll} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', background: 'rgba(0, 122, 255, 0.1)', color: '#007aff', cursor: 'pointer' }}>全部收起</button>
              <button onClick={copyFailedDetails} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', background: copiedDetail ? 'rgba(52, 199, 89, 0.15)' : 'rgba(0, 122, 255, 0.1)', color: copiedDetail ? '#34c759' : '#007aff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {copiedDetail ? <Check size={14} /> : <Copy size={14} />}
                {copiedDetail ? '已复制' : '复制明细'}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {Object.entries(groupedFailedFiles).map(([code, files]) => {
              const config = errorCodeConfig[code as FailedFileErrorCode]
              const isExpanded = expandedErrors.has(code)
              const stillInSourceCount = files.filter((f) => f.existsInSource).length

              return (
                <div key={code} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <button onClick={() => toggleErrorGroup(code)} style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: config.color }}>{config.icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#1d1d1f' }}>{config.label}</span>
                      <span style={{ fontSize: '12px', color: '#6e6e73', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '10px' }}>{files.length} 个</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {stillInSourceCount > 0 && (
                        <span style={{ fontSize: '11px', color: '#34c759', background: 'rgba(52, 199, 89, 0.1)', padding: '3px 8px', borderRadius: '4px' }}>
                          {stillInSourceCount} 个在原位置
                        </span>
                      )}
                      {isExpanded ? <ChevronUp size={18} color="#6e6e73" /> : <ChevronDown size={18} color="#6e6e73" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 20px 16px' }}>
                      {files.map((file, idx) => (
                        <div key={idx} style={{ padding: '12px', marginBottom: '8px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', borderLeft: `3px solid ${config.color}` }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f', marginBottom: '6px', wordBreak: 'break-all' }}>
                            {file.name || file.source.split('/').pop() || file.source.split('\\').pop()}
                          </div>
                          <div style={{ fontSize: '11px', color: '#6e6e73', marginBottom: '4px', wordBreak: 'break-all' }}>
                            原路径: {file.source}
                          </div>
                          {file.target && (
                            <div style={{ fontSize: '11px', color: '#6e6e73', marginBottom: '4px', wordBreak: 'break-all' }}>
                              目标: {file.target}
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: '#ff3b30', marginBottom: '4px' }}>
                            失败原因: {file.reason}
                          </div>
                          {file.originalError && file.originalError !== file.reason && (
                            <div style={{ fontSize: '11px', color: '#6e6e73', marginBottom: '4px' }}>
                              原始错误: {file.originalError}
                            </div>
                          )}
                          {file.suggestion && (
                            <div style={{ fontSize: '11px', color: '#007aff', marginTop: '6px', padding: '6px 10px', background: 'rgba(0, 122, 255, 0.08)', borderRadius: '4px' }}>
                              💡 建议操作: {file.suggestion}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', marginTop: '6px', color: file.existsInSource ? '#34c759' : '#6e6e73' }}>
                            {file.existsInSource ? '✓ 文件仍保留在原位置' : '✗ 文件已不在原位置'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {undoResult && (
        <div style={{ padding: '16px', background: undoResult.success ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)', borderRadius: '8px', marginBottom: '24px', maxWidth: '600px', margin: '0 auto 24px' }}>
          <span style={{ fontSize: '14px', color: undoResult.success ? '#34c759' : '#ff3b30' }}>{undoResult.message}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={handleUndo} disabled={isUndoing}>
          <RefreshCw size={18} spin={isUndoing} />
          <span>{isUndoing ? '撤销中...' : '撤销本次整理'}</span>
        </button>
        <button className="btn btn-primary" onClick={handleFinish}>
          <Home size={18} />
          <span>返回首页</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

function StatRow({ label, value, description, color }: { label: string; value: number; description?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', color: '#6e6e73' }}>{label}</span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: color || '#1d1d1f' }}>{value}</span>
      </div>
      {description && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{description}</span>}
    </div>
  )
}
