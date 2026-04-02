import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ChevronLeft, Folder, Clock, CheckCircle, RefreshCw } from '../components/Icons'

export default function HistoryPage() {
  const navigate = useNavigate()
  const { taskHistory } = useApp()

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>历史记录</h1>
      </div>
      <p className="page-subtitle">查看最近的文件整理任务</p>

      {taskHistory.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ fontSize: '16px', color: '#6e6e73' }}>暂无整理记录</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {taskHistory.map((task) => (
            <div key={task.taskId} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: task.status === 'completed' ? 'rgba(52, 199, 89, 0.1)' : '#f5f5f7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle size={24} color="#34c759" />
                    ) : (
                      <Folder size={24} color="#6e6e73" />
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                      {task.targetPath.split('/').pop() || task.targetPath}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#6e6e73' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} />
                        {new Date(task.startedAt).toLocaleString()}
                      </span>
                      <span>{task.movedFiles.length} 个文件</span>
                    </div>
                  </div>
                </div>

                {task.status === 'completed' && (
                  <button
                    onClick={() => alert('撤销功能')}
                    style={{
                      padding: '8px 16px',
                      background: '#f5f5f7',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <RefreshCw size={16} />
                    撤销
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
