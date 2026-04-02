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
import type { FailedFile, FailedFileErrorCode } from '../../shared/types'

const errorCodeConfig: Record<
  FailedFileErrorCode,
  { label: string; icon: React.ReactNode; color: string }
> = {
  DUPLICATE_NAME: {
    label: '重名冲突',
    icon: <FileX size={16} />,
    color: '#f59e0b',
  },
  PERMISSION_DENIED: {
    label: '权限不足',
    icon: <ShieldAlert size={16} />,
    color: '#ef4444',
  },
  SOURCE_NOT_FOUND: {
    label: '文件不存在',
    icon: <HelpCircle size={16} />,
    color: '#6b7280',
  },
  FILE_LOCKED: {
    label: '文件被占用',
    icon: <Lock size={16} />,
    color: '#f97316',
  },
  CROSS_VOLUME_MOVE: {
    label: '跨卷移动失败',
    icon: <HardDrive size={16} />,
    color: '#8b5cf6',
  },
  INVALID_PATH_CHARS: {
    label: '非法字符路径',
    icon: <AlertCircle size={16} />,
    color: '#ec4899',
  },
  TARGET_DIR_CREATE_FAILED: {
    label: '目录创建失败',
    icon: <FolderX size={16} />,
    color: '#dc2626',
  },
  UNKNOWN: {
    label: '未知错误',
    icon: <HelpCircle size={16} />,
    color: '#6b7280',
  },
}

export default function ResultPage() {
  const navigate = useNavigate()
  const { currentTask, clearCurrentTask } = useApp()
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoResult, setUndoResult] = useState<{ success: boolean; message: string } | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [copiedDetail, setCopiedDetail] = useState(false)

  if (!currentTask) {
    navigate('/')
    return null
  }

  // 按错误类型分组失败文件
  const groupedFailedFiles = currentTask.failedFiles.reduce(
    (acc, file) => {
      const code = file.errorCode || 'UNKNOWN'
      if (!acc[code]) {
        acc[code] = []
      }
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
        setUndoResult({
          success: false,
          message: 'Electron API 未初始化',
        })
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
      setUndoResult({
        success: false,
        message: '撤销过程中发生错误',
      })
    }

    setIsUndoing(false)
  }

  const handleFinish = () => {
    clearCurrentTask()
    navigate('/')
  }

  const toggleErrorGroup = (errorCode: string) => {
    const newExpanded = new Set(expandedErrors)
    if (newExpanded.has(errorCode)) {
      newExpanded.delete(errorCode)
    } else {
      newExpanded.add(errorCode)
    }
    setExpandedErrors(newExpanded)
  }

  const copyFailedDetails = () => {
    const lines: string[] = []
    lines.push(`文件整理失败明细 - ${new Date().toLocaleString()}`)
    lines.push(`总计失败: ${currentTask.failedFiles.length} 个文件`)
    lines.push('')

    Object.entries(groupedFailedFiles).forEach(([code, files]) => {
      const config = errorCodeConfig[code as FailedFileErrorCode]
      lines.push(`【${config.label}】(${files.length} 个)`)
      files.forEach((file) => {
        lines.push(`  文件: ${file.source}`)
        if (file.target) lines.push(`  目标: ${file.target}`)
        lines.push(`  原因: ${file.reason}`)
        if (file.suggestion) lines.push(`  建议: ${file.suggestion}`)
        lines.push(`  状态: ${file.existsInSource ? '仍存在于原位置' : '已不在原位置'}`)
        lines.push('')
      })
    })

    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedDetail(true)
    setTimeout(() => setCopiedDetail(false), 2000)
  }

  const expandAll = () => {
    setExpandedErrors(new Set(Object.keys(groupedFailedFiles)))
  }

  const collapseAll = () => {
    setExpandedErrors(new Set())
  }

  return (
    <div className="page-container" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(52, 199, 89, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}
      >
        <CheckCircle size={40} color="#34c759" />
      </div>

      <h1 className="page-title">整理完成！</h1>
      <p className="page-subtitle">您的文件已按方案整理完成</p>

      <div className="grid grid-3" style={{ maxWidth: '600px', margin: '0 auto 32px' }}>
        <StatCard
          icon={<Folder size={24} color="#007aff" />}
          value={currentTask.createdFolders.length}
          label="新建文件夹"
        />
        <StatCard
          icon={<FileText size={24} color="#34c759" />}
          value={currentTask.movedFiles.length}
          label="已移动文件"
        />
        <StatCard
          icon={<FileText size={24} color="#6e6e73" />}
          value={currentTask.skippedFiles.length}
          label="未处理文件"
        />
      </div>

      {/* 失败文件明细区域 */}
      {currentTask.failedFiles.length > 0 && (
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 24px',
            borderRadius: '12px',
            background: '#fff',
            border: '1px solid rgba(255, 59, 48, 0.2)',
            overflow: 'hidden',
          }}
        >
          {/* 头部 */}
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(255, 59, 48, 0.05)',
              borderBottom: '1px solid rgba(255, 59, 48, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={22} color="#ff3b30" />
              <div style={{ textAlign: 'left' }}>
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#ff3b30',
                  }}
                >
                  {currentTask.failedFiles.length} 个文件处理失败
                </div>
                <div style={{ fontSize: '12px', color: '#6e6e73', marginTop: '2px' }}>
                  按错误类型分为 {Object.keys(groupedFailedFiles).length} 类
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={expandAll}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(0, 122, 255, 0.1)',
                  color: '#007aff',
                  cursor: 'pointer',
                }}
              >
                全部展开
              </button>
              <button
                onClick={collapseAll}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(0, 122, 255, 0.1)',
                  color: '#007aff',
                  cursor: 'pointer',
                }}
              >
                全部收起
              </button>
              <button
                onClick={copyFailedDetails}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: copiedDetail ? 'rgba(52, 199, 89, 0.15)' : 'rgba(0, 122, 255, 0.1)',
                  color: copiedDetail ? '#34c759' : '#007aff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {copiedDetail ? <Check size={14} /> : <Copy size={14} />}
                {copiedDetail ? '已复制' : '复制明细'}
              </button>
            </div>
          </div>

          {/* 失败文件分组列表 */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {Object.entries(groupedFailedFiles).map(([code, files]) => {
              const config = errorCodeConfig[code as FailedFileErrorCode]
              const isExpanded = expandedErrors.has(code)
              const stillInSourceCount = files.filter((f) => f.existsInSource).length

              return (
                <div
                  key={code}
                  style={{
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
                  {/* 分组头部 */}
                  <button
                    onClick={() => toggleErrorGroup(code)}
                    style={{
                      width: '100%',
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: config.color }}>{config.icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#1d1d1f' }}>
                        {config.label}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#6e6e73',
                          background: 'rgba(0,0,0,0.05)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        {files.length} 个
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {stillInSourceCount > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#34c759',
                            background: 'rgba(52, 199, 89, 0.1)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          {stillInSourceCount} 个在原位置
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={18} color="#6e6e73" />
                      ) : (
                        <ChevronDown size={18} color="#6e6e73" />
                      )}
                    </div>
                  </button>

                  {/* 展开的详细列表 */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 16px' }}>
                      {files.map((file, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '12px',
                            marginBottom: '8px',
                            background: 'rgba(0,0,0,0.02)',
                            borderRadius: '8px',
                            borderLeft: `3px solid ${config.color}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              color: '#1d1d1f',
                              marginBottom: '6px',
                              wordBreak: 'break-all',
                            }}
                          >
                            {file.source.split('/').pop() || file.source.split('\\').pop()}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#6e6e73',
                              marginBottom: '4px',
                              wordBreak: 'break-all',
                            }}
                          >
                            原路径: {file.source}
                          </div>
                          {file.target && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#6e6e73',
                                marginBottom: '4px',
                                wordBreak: 'break-all',
                              }}
                            >
                              目标: {file.target}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#ff3b30',
                              marginBottom: '4px',
                            }}
                          >
                            失败原因: {file.reason}
                          </div>
                          {file.suggestion && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#007aff',
                                marginTop: '6px',
                                padding: '6px 10px',
                                background: 'rgba(0, 122, 255, 0.08)',
                                borderRadius: '4px',
                              }}
                            >
                              💡 建议操作: {file.suggestion}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: '11px',
                              marginTop: '6px',
                              color: file.existsInSource ? '#34c759' : '#6e6e73',
                            }}
                          >
                            {file.existsInSource
                              ? '✓ 文件仍保留在原位置'
                              : '✗ 文件已不在原位置（可能已被移动或删除）'}
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
        <div
          style={{
            padding: '16px',
            background: undoResult.success ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
            borderRadius: '8px',
            marginBottom: '24px',
            maxWidth: '600px',
            margin: '0 auto 24px',
          }}
        >
          <span style={{ fontSize: '14px', color: undoResult.success ? '#34c759' : '#ff3b30' }}>
            {undoResult.message}
          </span>
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
