import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ArrowRight, ChevronLeft, Folder, FileText, AlertCircle, ChevronDown, ChevronUp, MapPin } from '../components/Icons'
import { useState } from 'react'

export default function ExecuteConfirmPage() {
  const navigate = useNavigate()
  const { adjustedScheme, scanResult } = useApp()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [showAllFiles, setShowAllFiles] = useState(false)

  if (!adjustedScheme) {
    navigate('/scheme-adjust')
    return null
  }

  const targetPath = scanResult?.targetPath || adjustedScheme.previewTree?.path || '未知路径'

  // 按目标文件夹分组文件
  const filesByFolder = adjustedScheme.plannedMoves.reduce(
    (acc, move) => {
      if (!acc[move.targetFolder]) acc[move.targetFolder] = []
      acc[move.targetFolder].push(move)
      return acc
    },
    {} as Record<string, typeof adjustedScheme.plannedMoves>
  )

  const toggleFolder = (folder: string) => {
    const newSet = new Set(expandedFolders)
    if (newSet.has(folder)) newSet.delete(folder)
    else newSet.add(folder)
    setExpandedFolders(newSet)
  }

  const handleExecute = () => {
    navigate('/executing')
  }

  // 计算统计
  const totalFiles = adjustedScheme.plannedMoves.length
  const totalFolders = adjustedScheme.suggestedFolders.length
  const uncertainCount = adjustedScheme.uncertainItems.length

  return (
    <div className="page-container">
      <h1 className="page-title">执行确认</h1>
      <p className="page-subtitle">请确认以下整理操作，执行后可撤销</p>

      {/* 操作摘要卡片 */}
      <div className="grid grid-3" style={{ marginBottom: '24px' }}>
        <StatCard
          icon={<Folder size={24} color="#007aff" />}
          value={totalFolders}
          label="新建文件夹"
        />
        <StatCard
          icon={<FileText size={24} color="#34c759" />}
          value={totalFiles}
          label="移动文件"
        />
        <StatCard
          icon={<AlertCircle size={24} color="#ff9500" />}
          value={uncertainCount}
          label="保留原位"
        />
      </div>

      {/* 目标路径 */}
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
          {targetPath}
        </div>
      </div>

      {/* 文件夹预览 */}
      <div style={{ 
        marginBottom: '24px', 
        borderRadius: '12px', 
        background: '#fff', 
        border: '1px solid rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ 
          padding: '16px 20px', 
          background: 'rgba(0,0,0,0.02)', 
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Folder size={20} color="#007aff" />
          <span style={{ fontSize: '15px', fontWeight: 600 }}>将新建的文件夹</span>
          <span style={{ fontSize: '12px', color: '#6e6e73', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
            {totalFolders} 个
          </span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {adjustedScheme.suggestedFolders.map((folder) => (
              <span
                key={folder}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0, 122, 255, 0.1)',
                  color: '#007aff',
                  borderRadius: '6px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Folder size={14} />
                {folder}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 文件去向预览 */}
      <div style={{ 
        marginBottom: '24px', 
        borderRadius: '12px', 
        background: '#fff', 
        border: '1px solid rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ 
          padding: '16px 20px', 
          background: 'rgba(0,0,0,0.02)', 
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="#34c759" />
            <span style={{ fontSize: '15px', fontWeight: 600 }}>文件去向预览</span>
            <span style={{ fontSize: '12px', color: '#6e6e73', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
              {totalFiles} 个文件
            </span>
          </div>
          <button
            onClick={() => setShowAllFiles(!showAllFiles)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              background: 'rgba(0, 122, 255, 0.1)',
              color: '#007aff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {showAllFiles ? '收起' : '展开全部'}
          </button>
        </div>

        <div style={{ maxHeight: showAllFiles ? '500px' : '300px', overflowY: 'auto' }}>
          {Object.entries(filesByFolder).map(([folder, moves]) => {
            const isExpanded = expandedFolders.has(folder) || showAllFiles
            const displayMoves = showAllFiles ? moves : moves.slice(0, 3)
            const hasMore = moves.length > 3 && !showAllFiles

            return (
              <div key={folder} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <button
                  onClick={() => toggleFolder(folder)}
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
                    <Folder size={18} color="#007aff" />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#1d1d1f' }}>
                      {folder}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6e6e73' }}>
                      ({moves.length} 个文件)
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={18} color="#6e6e73" />
                  ) : (
                    <ChevronDown size={18} color="#6e6e73" />
                  )}
                </button>

                {(isExpanded || showAllFiles) && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {displayMoves.map((move, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px',
                          marginBottom: '6px',
                          background: 'rgba(0,0,0,0.02)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <FileText size={14} color="#6e6e73" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', color: '#1d1d1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {move.file.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {move.file.path}
                          </div>
                        </div>
                        <ArrowRight size={14} color="#007aff" />
                        <div style={{ fontSize: '11px', color: '#007aff', minWidth: '60px' }}>
                          → {folder}
                        </div>
                      </div>
                    ))}
                    {hasMore && (
                      <div
                        style={{
                          padding: '8px',
                          textAlign: 'center',
                          fontSize: '12px',
                          color: '#6e6e73',
                        }}
                      >
                        还有 {moves.length - 3} 个文件...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 风险提示 */}
      <div
        style={{
          padding: '16px',
          background: 'rgba(0, 122, 255, 0.1)',
          borderRadius: '8px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <AlertCircle size={20} color="#007aff" />
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>可撤销保障</p>
          <p style={{ fontSize: '13px', color: '#6e6e73' }}>
            本次整理操作将在执行完成后生成撤销记录。执行后您可以查看每个文件的具体去向，如需恢复，可在结果页点击"撤销本次整理"。
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/scheme-adjust')}>
          <ChevronLeft size={18} />
          <span>返回调整</span>
        </button>
        <button className="btn btn-primary" onClick={handleExecute}>
          <span>开始整理</span>
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
