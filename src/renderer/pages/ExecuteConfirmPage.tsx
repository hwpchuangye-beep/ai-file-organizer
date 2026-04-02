import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ArrowRight, ChevronLeft, Folder, FileText, AlertCircle } from '../components/Icons'

export default function ExecuteConfirmPage() {
  const navigate = useNavigate()
  const { adjustedScheme, setCurrentTask } = useApp()

  if (!adjustedScheme) {
    navigate('/scheme-adjust')
    return null
  }

  const handleExecute = () => {
    const task: import('@shared/types').OrganizationTask = {
      taskId: Date.now().toString(),
      targetPath: adjustedScheme.previewTree.path,
      createdFolders: adjustedScheme.suggestedFolders,
      movedFiles: adjustedScheme.plannedMoves.map(m => ({
        source: m.file.path,
        target: m.targetPath,
      })),
      skippedFiles: [],
      failedFiles: [],
      startedAt: new Date(),
      status: 'pending',
    }
    setCurrentTask(task)
    navigate('/executing')
  }

  return (
    <div className="page-container">
      <h1 className="page-title">执行确认</h1>
      <p className="page-subtitle">请确认以下整理操作，执行后可撤销</p>

      <div className="grid grid-3" style={{ marginBottom: '32px' }}>
        <StatCard
          icon={<Folder size={24} color="#007aff" />}
          value={adjustedScheme.suggestedFolders.length}
          label="新建文件夹"
        />
        <StatCard
          icon={<FileText size={24} color="#34c759" />}
          value={adjustedScheme.plannedMoves.length}
          label="移动文件"
        />
        <StatCard
          icon={<AlertCircle size={24} color="#ff9500" />}
          value={adjustedScheme.uncertainItems.length}
          label="不确定项"
        />
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px' }}>操作摘要</h3>
        <div style={{ padding: '16px', background: '#f5f5f7', borderRadius: '8px' }}>
          <p style={{ marginBottom: '8px' }}>• 将创建 {adjustedScheme.suggestedFolders.length} 个分类文件夹</p>
          <p style={{ marginBottom: '8px' }}>• 将移动 {adjustedScheme.plannedMoves.length} 个文件</p>
          <p>• {adjustedScheme.uncertainItems.length} 个文件将保留原位</p>
        </div>
      </div>

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
            本次整理操作将在执行完成后生成撤销记录。如需恢复，可在结果页点击"撤销本次整理"。
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
