import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { CheckCircle, Folder, FileText, RefreshCw, Home, AlertCircle } from '../components/Icons'

export default function ResultPage() {
  const navigate = useNavigate()
  const { currentTask, clearCurrentTask } = useApp()
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoResult, setUndoResult] = useState<{ success: boolean; message: string } | null>(null)

  if (!currentTask) {
    navigate('/')
    return null
  }

  const handleUndo = async () => {
    setIsUndoing(true)
    setUndoResult(null)
    
    try {
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

      {currentTask.failedFiles.length > 0 && (
        <div
          style={{
            padding: '16px',
            background: 'rgba(255, 59, 48, 0.1)',
            borderRadius: '8px',
            marginBottom: '24px',
            maxWidth: '600px',
            margin: '0 auto 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertCircle size={18} color="#ff3b30" />
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#ff3b30' }}>
              {currentTask.failedFiles.length} 个文件处理失败
            </span>
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
        <button 
          className="btn btn-secondary" 
          onClick={handleUndo}
          disabled={isUndoing}
        >
          <RefreshCw size={18} style={{ animation: isUndoing ? 'spin 1s linear infinite' : 'none' }} />
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
