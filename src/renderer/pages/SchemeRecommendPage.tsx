import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Folder, ArrowRight, RefreshCw, CheckCircle, AlertCircle, HelpCircle, Info } from '../components/Icons'
import type { OrganizationScheme } from '@shared/types'
import sceneTaxonomy from '@shared/config/scene-taxonomy.json'

const CONFIDENCE_CONFIG = {
  very_high: { label: '极高置信度', color: '#34c759', icon: CheckCircle, bgColor: '#34c75920' },
  high: { label: '高置信度', color: '#007aff', icon: CheckCircle, bgColor: '#007aff20' },
  medium: { label: '中等置信度', color: '#ff9500', icon: HelpCircle, bgColor: '#ff950020' },
  low: { label: '低置信度', color: '#6e6e73', icon: AlertCircle, bgColor: '#6e6e7320' },
  very_low: { label: '极低置信度', color: '#ff3b30', icon: AlertCircle, bgColor: '#ff3b3020' },
}

const PLANNING_STAGES = [
  { key: 'profile', title: '目录画像解析', detail: '统计类型分布、命名簇和时间聚集' },
  { key: 'protect', title: '项目保护识别', detail: '保护 .git / package.json 等原子目录' },
  { key: 'scene', title: '场景与业务识别', detail: '识别简历/合同/PRD 等场景并计算置信度' },
  { key: 'gate', title: '规则层门禁校验', detail: '白名单、路径沙箱、低置信度保守策略' },
  { key: 'rank', title: '候选方案去重排序', detail: '按可执行价值 + 安全性 + 碎片惩罚综合排序' },
] as const

function schemeLabel(schemeType: OrganizationScheme['schemeType']) {
  if (schemeType === 'business') return '按业务整理'
  if (schemeType === 'business_category') return '按业务 + 类别二级整理'
  return '按类别整理'
}

function plannedMovesCount(scheme: OrganizationScheme) {
  return scheme.moves.filter((move) => move.statusHint === 'planned').length
}

function renderReasonList(items: string[]) {
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} style={{ fontSize: '13px', color: '#6e6e73' }}>
          • {item}
        </div>
      ))}
    </div>
  )
}

function uncertainReasonItems(scheme: OrganizationScheme) {
  if (Array.isArray(scheme.uncertainExplanations) && scheme.uncertainExplanations.length > 0) {
    return scheme.uncertainExplanations
  }
  if (scheme.uncertainFiles.length > 0) {
    return ['文件命名模糊或目录混杂，建议人工确认后再执行']
  }
  return []
}

function buildRealtimeInsights(schemeInput: { totalFiles?: number; movableFiles?: number; protectedItems?: number; hiddenDirs?: number; topScene?: string; topBusiness?: string; largeTask?: boolean }) {
  const totalFiles = schemeInput.totalFiles ?? 0
  const movableFiles = schemeInput.movableFiles ?? 0
  const protectedItems = schemeInput.protectedItems ?? 0
  const hiddenDirs = schemeInput.hiddenDirs ?? 0
  const topScene = schemeInput.topScene
  const topBusiness = schemeInput.topBusiness
  const largeTask = Boolean(schemeInput.largeTask)

  const lines = [
    `目录画像已载入：共 ${totalFiles} 个文件，预计可整理 ${movableFiles} 个。`,
    protectedItems > 0
      ? `检测到 ${protectedItems} 个项目/工作区保护项，内部文件不会被拆分。`
      : '未命中项目保护目录，继续评估可执行整理策略。',
    topScene
      ? `场景信号正在收敛：当前强信号为「${topScene}」。`
      : '场景信号较分散，系统将优先走保守门禁判断。',
    topBusiness
      ? `业务信号参考：当前主业务倾向「${topBusiness}」。`
      : '业务信号不足，将优先采用类别兜底策略。',
    hiddenDirs > 0
      ? `发现 ${hiddenDirs} 个历史隐藏目录候选，已纳入修复建议但不会自动执行。`
      : '未发现历史隐藏目录异常。',
    '执行前门禁检查中：计划必须通过 schema + 规则层双校验。',
  ]

  if (largeTask) {
    lines.push('目录规模较大，必要时会切换分批执行并保存 checkpoint。')
  }

  return lines
}

export default function SchemeRecommendPage() {
  const navigate = useNavigate()
  const {
    directoryProfile,
    modelConfig,
    schemes,
    setSchemes,
    setSelectedScheme,
  } = useApp()
  const [isGenerating, setIsGenerating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plannerInfo, setPlannerInfo] = useState<{
    source: 'model' | 'rules'
    model?: string | null
    message?: string
  } | null>(null)
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const generationStartedRef = useRef(false)

  useEffect(() => {
    if (!directoryProfile) {
      navigate('/')
      return
    }
    if (schemes.length === 0 && !generationStartedRef.current) {
      generationStartedRef.current = true
      generateSchemes()
    } else {
      setIsGenerating(false)
    }
  }, [directoryProfile, navigate, schemes.length])

  const actionableSchemes = useMemo(
    () => schemes.filter((scheme) => (scheme.displayState || 'actionable') === 'actionable'),
    [schemes],
  )

  const holdSafeSchemes = useMemo(
    () => schemes.filter((scheme) => scheme.displayState === 'hold_safe'),
    [schemes],
  )

  const recommendedActionableSchemeId = useMemo(() => {
    const explicit = actionableSchemes.find((scheme) => scheme.isRecommended)
    return explicit?.schemeId || actionableSchemes[0]?.schemeId || null
  }, [actionableSchemes])

  const loadingStageIndex = useMemo(() => {
    const stageDurationMs = 1800
    return Math.min(PLANNING_STAGES.length - 1, Math.floor(loadingElapsedMs / stageDurationMs))
  }, [loadingElapsedMs])

  const loadingProgress = useMemo(() => {
    const maxDuration = PLANNING_STAGES.length * 1800
    const base = Math.min(0.96, Math.max(0.08, loadingElapsedMs / maxDuration))
    if (loadingStageIndex === PLANNING_STAGES.length - 1 && loadingElapsedMs > maxDuration) {
      const pulse = (Math.sin(loadingElapsedMs / 500) + 1) / 2
      return 0.9 + pulse * 0.08
    }
    return base
  }, [loadingElapsedMs])

  const isLongTailWaiting = useMemo(() => {
    return loadingStageIndex === PLANNING_STAGES.length - 1 && loadingElapsedMs > 15000
  }, [loadingStageIndex, loadingElapsedMs])

  const realtimeInsights = useMemo(() => {
    const topScene = [...(directoryProfile?.sceneSignals || [])]
      .sort((a, b) => b.score - a.score)[0]?.category
    const topBusiness = [...(directoryProfile?.businessSignals || [])]
      .sort((a, b) => b.score - a.score)[0]?.category

    return buildRealtimeInsights({
      totalFiles: directoryProfile?.scanStats.totalFiles,
      movableFiles: directoryProfile?.scanStats.estimatedMovableFiles,
      protectedItems: directoryProfile?.protectedItems.length,
      hiddenDirs: directoryProfile?.hiddenDirectoryCandidates?.length,
      topScene,
      topBusiness,
      largeTask: directoryProfile?.scanStats.largeTaskModeSuggested,
    })
  }, [directoryProfile])

  const visibleInsightCount = useMemo(() => {
    return Math.min(realtimeInsights.length, 1 + Math.floor(loadingElapsedMs / 1300))
  }, [realtimeInsights.length, loadingElapsedMs])

  useEffect(() => {
    if (!isGenerating) {
      loadingStartRef.current = null
      setLoadingElapsedMs(0)
      return
    }
    if (!loadingStartRef.current) {
      loadingStartRef.current = Date.now()
    }
    const timer = window.setInterval(() => {
      const startedAt = loadingStartRef.current || Date.now()
      setLoadingElapsedMs(Date.now() - startedAt)
    }, 240)
    return () => window.clearInterval(timer)
  }, [isGenerating])

  const generateSchemes = async () => {
    if (!directoryProfile || !window.electronAPI) return
    setIsGenerating(true)
    setError(null)
    setPlannerInfo(null)

    const result = await window.electronAPI.generateOrganizationSchemes({
      profileId: directoryProfile.profileId,
      modelConfig,
    })

    if (result.success && result.schemes) {
      setSchemes(result.schemes)
      setPlannerInfo({
        source: result.plannerSource || 'rules',
        model: result.plannerModel || modelConfig?.modelName || null,
        message: result.plannerMessage,
      })
    } else {
      setError(result.error || '生成方案失败')
    }
    generationStartedRef.current = false
    setIsGenerating(false)
  }

  const handleSelectScheme = (scheme: OrganizationScheme) => {
    setSelectedScheme(scheme)
    navigate('/scheme-adjust')
  }

  if (isGenerating) {
    const elapsedSeconds = (loadingElapsedMs / 1000).toFixed(1)
    const ringDeg = `${Math.round(loadingProgress * 360)}deg`
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px' }}>
        <div
          style={{
            width: 'min(820px, 100%)',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 20px 50px rgba(2, 8, 23, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', marginBottom: '22px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '96px', height: '96px', flexShrink: 0 }}>
              <div
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  background: `conic-gradient(#0a84ff 0 ${ringDeg}, #d8dee9 ${ringDeg} 360deg)`,
                  animation: 'ringSpin 4s linear infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '10px',
                  borderRadius: '50%',
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0f172a',
                }}
              >
                {Math.round(loadingProgress * 100)}%
              </div>
              <div
                style={{
                  position: 'absolute',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  top: '-2px',
                  left: '42px',
                  animation: 'orbit 1.8s ease-in-out infinite',
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: '280px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>正在生成整理计划</h2>
              <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '10px' }}>
                这不是卡住，系统正在执行真实流水线：画像 → 保护 → 规则门禁 → 去重排序
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                <span>已运行 {elapsedSeconds}s</span>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#94a3b8' }} />
                <span>当前阶段：{PLANNING_STAGES[loadingStageIndex].title}</span>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#94a3b8' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.2s ease-in-out infinite' }} />
                  工作中
                </span>
              </div>
              {isLongTailWaiting && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#92400e' }}>
                  正在进行深度场景识别与候选去重（文档越多耗时越长），不是卡死。
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '9px', marginBottom: '18px' }}>
            {PLANNING_STAGES.map((stage, index) => {
              const done = index < loadingStageIndex
              const active = index === loadingStageIndex
              return (
                <div
                  key={stage.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    background: active ? '#e8f2ff' : done ? '#ecfdf3' : '#ffffff',
                    border: `1px solid ${active ? '#bfdbfe' : done ? '#bbf7d0' : '#e5e7eb'}`,
                    transition: 'all 220ms ease',
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: done ? '#22c55e' : active ? '#0a84ff' : '#cbd5e1',
                      boxShadow: active ? '0 0 0 6px rgba(10, 132, 255, 0.12)' : 'none',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{stage.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{stage.detail}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: done ? '#16a34a' : active ? '#0a84ff' : '#94a3b8' }}>
                    {done ? '已完成' : active ? '进行中' : '排队中'}
                  </div>
                </div>
              )
            })}
          </div>

          <div
            style={{
              borderRadius: '12px',
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '14px',
              fontFamily: '"SF Mono", "Roboto Mono", ui-monospace, Menlo, monospace',
              fontSize: '12px',
              lineHeight: 1.65,
            }}
          >
            <div style={{ color: '#93c5fd', marginBottom: '8px' }}>实时思考流</div>
            {realtimeInsights.slice(0, visibleInsightCount).map((line, index) => (
              <div key={`${line}-${index}`} style={{ animation: `fadeUp 260ms ease ${index * 70}ms both` }}>
                <span style={{ color: '#22c55e' }}>[{String(index + 1).padStart(2, '0')}]</span> {line}
              </div>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes ringSpin { to { transform: rotate(360deg); } }
          @keyframes orbit {
            0% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(4px); opacity: .55; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes pulse {
            0% { transform: scale(1); opacity: .65; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(1); opacity: .65; }
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  if (error && schemes.length === 0) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#ff3b30' }}>生成失败</h2>
        <p style={{ fontSize: '15px', color: '#6e6e73', marginBottom: '20px' }}>{error}</p>
        <button className="btn btn-primary" onClick={generateSchemes}>重试</button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h1 className="page-title">推荐整理方案</h1>
        <button
          onClick={generateSchemes}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#007aff' }}
        >
          <RefreshCw size={18} />
          <span>重新生成</span>
        </button>
      </div>
      <p className="page-subtitle">方案均已通过 schema 与规则层校验，推荐按“可执行价值 + 安全性 + 碎片惩罚”综合排序</p>
      {plannerInfo && (
        <div
          style={{
            marginBottom: '14px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${plannerInfo.source === 'model' ? '#bfdbfe' : '#e2e8f0'}`,
            background: plannerInfo.source === 'model' ? '#eff6ff' : '#f8fafc',
            fontSize: '13px',
            color: plannerInfo.source === 'model' ? '#1d4ed8' : '#475569',
          }}
        >
          {plannerInfo.source === 'model'
            ? `本次由模型决策推荐：${plannerInfo.model || '未命名模型'}`
            : '本次使用规则引擎推荐（模型未参与或不可用）'}
          {plannerInfo.message ? ` · ${plannerInfo.message}` : ''}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
        {sceneTaxonomy.categories.map((item) => (
          <span
            key={item.name}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              background: item.tier === 'A' ? '#e8f2ff' : '#f5f5f7',
              color: item.tier === 'A' ? '#1d4ed8' : '#4b5563',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {item.name}
          </span>
        ))}
      </div>

      {holdSafeSchemes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: actionableSchemes.length > 0 ? '24px' : '0' }}>
          {holdSafeSchemes.map((scheme) => {
            const uncertainReasons = uncertainReasonItems(scheme)
            return (
              <div
                key={scheme.schemeId}
                className="card"
                style={{ border: '1px solid #ffd8bf', background: '#fff7ed', display: 'flex', gap: '20px', alignItems: 'flex-start' }}
              >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: '#ff950020',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertCircle size={24} color="#ff9500" />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600 }}>当前不建议自动整理</h3>
                  <span style={{ padding: '4px 10px', background: '#ff9500', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                    安全状态卡
                  </span>
                </div>

                <p style={{ fontSize: '14px', color: '#7c2d12', marginBottom: '10px' }}>
                  该方案会保持原位，不自动移动低置信度文件。你可以先查看可执行方案，或继续保守处理。
                </p>

                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                  <Stat label="计划移动" value={plannedMovesCount(scheme)} />
                  <Stat label="待确认" value={scheme.uncertainFiles.length} />
                  <Stat label="目录" value={scheme.folders.length} />
                </div>

                <p style={{ fontSize: '13px', color: '#6e6e73' }}>{scheme.reasons.join('；')}</p>
                {renderReasonList(uncertainReasons)}

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const block = document.getElementById('actionable-schemes')
                      if (block) {
                        block.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }}
                    disabled={actionableSchemes.length === 0}
                    style={actionableSchemes.length === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  >
                    <span>{actionableSchemes.length === 0 ? '保持原位（当前）' : '查看可执行方案'}</span>
                    {actionableSchemes.length > 0 ? <ArrowRight size={16} /> : null}
                  </button>
                </div>
              </div>
              </div>
            )
          })}
        </div>
      )}

      <div id="actionable-schemes" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {actionableSchemes.map((scheme) => {
          const conf = CONFIDENCE_CONFIG[scheme.confidenceLevel] || CONFIDENCE_CONFIG.medium
          const isRecommended = scheme.schemeId === recommendedActionableSchemeId
          const plannedCount = plannedMovesCount(scheme)
          const uncertainReasons = uncertainReasonItems(scheme)

          return (
            <div key={scheme.schemeId} className="card" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: isRecommended ? conf.bgColor : '#f5f5f7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Folder size={24} color={isRecommended ? conf.color : '#6e6e73'} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{schemeLabel(scheme.schemeType)}</h3>
                  {isRecommended && (
                    <span style={{ padding: '4px 10px', background: '#007aff', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                      推荐
                    </span>
                  )}
                  <span style={{ padding: '4px 10px', background: conf.bgColor, color: conf.color, borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                    {conf.label}
                  </span>
                  {typeof scheme.dedupGroupSize === 'number' && scheme.dedupGroupSize > 1 && (
                    <span style={{ padding: '4px 10px', background: '#f2f7ff', color: '#1d4ed8', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                      已去重 {scheme.dedupGroupSize - 1} 个等价候选
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '12px' }}>
                  {scheme.reasons.join('；')}
                </p>

                <div style={{ display: 'flex', gap: '24px', marginBottom: '14px' }}>
                  <Stat label="文件夹" value={scheme.folders.length} />
                  <Stat label="计划移动" value={plannedCount} />
                  <Stat label="待确认" value={scheme.uncertainFiles.length} />
                </div>

                {scheme.uncertainFiles.length > 0 && (
                  <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Info size={14} color="#64748b" />
                      <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>待确认说明</span>
                    </div>
                    {renderReasonList(uncertainReasons)}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {scheme.folders.map((folder) => (
                    <span
                      key={folder.folderId}
                      style={{
                        padding: '6px 12px',
                        background: folder.folderType === 'uncertain' ? '#fff3cd' : '#f5f5f7',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: folder.folderType === 'uncertain' ? '#856404' : '#1d1d1f',
                      }}
                    >
                      {folder.displayName}
                    </span>
                  ))}
                </div>

                <button className="btn btn-primary" onClick={() => handleSelectScheme(scheme)}>
                  <span>选择此方案</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {actionableSchemes.length === 0 && holdSafeSchemes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#6e6e73' }}>
          当前没有可展示的整理方案，请重新生成。
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: '20px', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '13px', color: '#6e6e73' }}>{label}</div>
    </div>
  )
}
