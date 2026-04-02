import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Folder, ArrowRight, Image, Download } from '../components/Icons'

export default function ScanResultPage() {
  const navigate = useNavigate()
  const { scanResult } = useApp()

  if (!scanResult) {
    navigate('/')
    return null
  }

  const { targetPath, totalFiles, issueSummary, issueTags, files } = scanResult

  const folderName = targetPath.split('/').pop() || targetPath

  return (
    <div className="page-container">
      <h1 className="page-title">扫描结果</h1>
      <p className="page-subtitle">已分析 {folderName} 目录，发现以下情况</p>

      <div className="grid grid-3" style={{ marginBottom: '32px' }}>
        <StatCard
          icon={<Folder size={24} color="#007aff" />}
          value={totalFiles}
          label="文件总数"
        />
        <StatCard
          icon={<Image size={24} color="#34c759" />}
          value={issueSummary.screenshotsCount}
          label="图片/截图"
        />
        <StatCard
          icon={<Download size={24} color="#5856d6" />}
          value={issueSummary.downloadsCount}
          label="下载文件"
        />
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px' }}>问题摘要</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {issueTags.map((tag, index) => (
            <span
              key={index}
              style={{
                padding: '6px 12px',
                background: '#ff3b3020',
                color: '#ff3b30',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          ))}
          {issueTags.length === 0 && (
            <span style={{ fontSize: '14px', color: '#6e6e73' }}>未发现明显问题</span>
          )}
        </div>

        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px' }}>文件类型分布</h3>
        <FileTypeList files={files} />
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          重新选择目录
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/scheme-recommend')}>
          <span>查看推荐方案</span>
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

function FileTypeList({ files }: { files: any[] }) {
  const typeCount: Record<string, number> = {}
  files.forEach(file => {
    const type = file.extension || '其他'
    typeCount[type] = (typeCount[type] || 0) + 1
  })

  const sortedTypes = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
      {sortedTypes.map(([type, count]) => (
        <div
          key={type}
          style={{
            padding: '12px',
            background: '#f5f5f7',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{type || '无扩展名'}</span>
          <span style={{ fontSize: '13px', color: '#6e6e73' }}>{count}</span>
        </div>
      ))}
    </div>
  )
}
