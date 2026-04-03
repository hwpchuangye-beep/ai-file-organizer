import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Folder, ArrowRight, Image, Download } from '../components/Icons'
import { useEffect } from 'react'

const CATEGORY_LABELS: Record<string, string> = {
  table: '表格',
  document: '文档',
  image: '图片',
  presentation: '演示',
  mindmap: '脑图',
  archive: '压缩包',
  installer: '安装包',
  audio: '音频',
  video: '视频',
  code: '代码',
  other: '其他',
}

export default function ScanResultPage() {
  const navigate = useNavigate()
  const { directoryProfile } = useApp()

  useEffect(() => {
    if (!directoryProfile) {
      navigate('/', { replace: true })
    }
  }, [directoryProfile, navigate])

  if (!directoryProfile) return null

  const { target, scanStats, summary, typeDistribution, protectedItems, hiddenDirectoryCandidates } = directoryProfile
  const imageCount = typeDistribution.find((item) => item.category === 'image')?.count || 0
  const installerOrArchive = (typeDistribution.find((item) => item.category === 'installer')?.count || 0)
    + (typeDistribution.find((item) => item.category === 'archive')?.count || 0)

  const tags: string[] = []
  if (imageCount > 5) tags.push('图片堆积')
  if (installerOrArchive > 5) tags.push('安装包/压缩包堆积')
  if ((hiddenDirectoryCandidates || []).length > 0) tags.push('存在历史隐藏目录')
  if (protectedItems.length > 0) tags.push(`保护 ${protectedItems.length} 个项目目录`)

  return (
    <div className="page-container">
      <h1 className="page-title">扫描结果</h1>
      <p className="page-subtitle">已分析 {target.displayName}，完成目录画像</p>

      <div className="grid grid-3" style={{ marginBottom: '32px' }}>
        <StatCard icon={<Folder size={24} color="#007aff" />} value={scanStats.totalFiles} label="总文件数" />
        <StatCard icon={<Image size={24} color="#34c759" />} value={imageCount} label="图片文件" />
        <StatCard icon={<Download size={24} color="#5856d6" />} value={installerOrArchive} label="安装/压缩" />
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px' }}>目录摘要</h3>
        <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '16px' }}>
          类型: {summary.directoryType} · 复杂度: {summary.estimatedComplexity} · 推荐策略: {summary.recommendedStrategyHint}
        </p>

        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px' }}>风险标签</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {tags.map((tag, index) => (
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
          {tags.length === 0 && (
            <span style={{ fontSize: '14px', color: '#6e6e73' }}>未发现高风险项</span>
          )}
        </div>

        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px' }}>类型分布</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {typeDistribution.map((item) => (
            <div
              key={item.category}
              style={{
                padding: '12px',
                background: '#f5f5f7',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{CATEGORY_LABELS[item.category] || item.category}</span>
              <span style={{ fontSize: '13px', color: '#6e6e73' }}>{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          重新选择目录
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/scheme-recommend')}>
          <span>生成整理方案</span>
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
