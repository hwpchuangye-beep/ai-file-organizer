import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState, useEffect } from 'react'
import { Folder, ArrowRight, RefreshCw, Info, CheckCircle, AlertCircle, HelpCircle } from '../components/Icons'
import type { OrganizationScheme } from '@shared/types'

// 置信度配置
const CONFIDENCE_CONFIG = {
  'very-high': { label: '极高置信度', color: '#34c759', icon: CheckCircle, bgColor: '#34c75920' },
  'high': { label: '高置信度', color: '#007aff', icon: CheckCircle, bgColor: '#007aff20' },
  'medium': { label: '中等置信度', color: '#ff9500', icon: HelpCircle, bgColor: '#ff950020' },
  'low': { label: '保守方案', color: '#6e6e73', icon: AlertCircle, bgColor: '#6e6e7320' },
}

export default function SchemeRecommendPage() {
  const navigate = useNavigate()
  const { scanResult, modelConfig, setSelectedScheme } = useApp()
  const [schemes, setSchemes] = useState<OrganizationScheme[]>([])
  const [isGenerating, setIsGenerating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'model' | 'fallback'>('fallback')
  const [recommendation, setRecommendation] = useState<any>(null)

  useEffect(() => {
    if (!scanResult) {
      navigate('/')
      return
    }

    generateSchemes()
  }, [scanResult])

  const generateSchemes = async () => {
    setIsGenerating(true)
    setError(null)
    
    try {
      if (!modelConfig) {
        setError('请先配置模型')
        setIsGenerating(false)
        return
      }

      if (!window.electronAPI) {
        setError('Electron API 未初始化')
        setIsGenerating(false)
        return
      }
      
      const result = await window.electronAPI.generateSchemes(scanResult!, modelConfig)
      
      if (result.success && result.schemes) {
        setSchemes(result.schemes)
        setSource(result.source || 'fallback')
        setRecommendation(result.recommendation || null)
      } else {
        setError(result.message || '生成方案失败')
      }
    } catch (err) {
      setError('生成方案时发生错误')
    }

    setIsGenerating(false)
  }

  const handleSelectScheme = (scheme: OrganizationScheme) => {
    setSelectedScheme(scheme)
    // 先跳转到方案调整页，让用户确认后再执行
    navigate('/scheme-adjust')
  }

  if (isGenerating) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            border: '4px solid #e3e3e8',
            borderTopColor: '#007aff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px',
          }}
        />
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>AI 正在分析文件...</h2>
        <p style={{ fontSize: '15px', color: '#6e6e73' }}>正在根据文件特征生成最佳整理方案</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error && schemes.length === 0) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#ff3b30' }}>生成失败</h2>
        <p style={{ fontSize: '15px', color: '#6e6e73', marginBottom: '20px' }}>{error}</p>
        <button className="btn btn-primary" onClick={generateSchemes}>
          重试
        </button>
      </div>
    )
  }

  // 获取第一个方案的置信度（主要推荐）
  const primaryScheme = schemes[0]
  const confidence = primaryScheme?.confidence || 'medium'
  const confidenceConfig = CONFIDENCE_CONFIG[confidence as keyof typeof CONFIDENCE_CONFIG] || CONFIDENCE_CONFIG.medium

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
      <p className="page-subtitle">
        根据文件分析结果，为您推荐以下 {schemes.length} 套整理方案
      </p>

      {/* 置信度提示 */}
      {recommendation && (
        <div
          style={{
            padding: '16px',
            background: confidenceConfig.bgColor,
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <confidenceConfig.icon size={24} color={confidenceConfig.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: confidenceConfig.color, marginBottom: '4px' }}>
              {confidenceConfig.label}
              {recommendation.confidenceValue && (
                <span style={{ marginLeft: '8px', fontSize: '13px', opacity: 0.8 }}>
                  ({Math.round(recommendation.confidenceValue * 100)}%)
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: '#1d1d1f' }}>
              {recommendation.reason}
            </div>
            {recommendation.matchedFiles && recommendation.totalFiles && (
              <div style={{ fontSize: '13px', color: '#6e6e73', marginTop: '6px' }}>
                涉及 {recommendation.matchedFiles} / {recommendation.totalFiles} 个文件
              </div>
            )}
          </div>
        </div>
      )}

      {source === 'fallback' && !recommendation?.scheme && (
        <div
          style={{
            padding: '12px 16px',
            background: '#fff3cd',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Info size={18} color="#856404" />
          <span style={{ fontSize: '14px', color: '#856404' }}>
            当前为基础规则方案。如需AI智能分析，请检查模型配置。
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {schemes.map((scheme, index) => {
          const schemeConfidence = scheme.confidence || 'medium'
          const schemeConfConfig = CONFIDENCE_CONFIG[schemeConfidence as keyof typeof CONFIDENCE_CONFIG] || CONFIDENCE_CONFIG.medium
          
          return (
            <div key={scheme.schemeId} className="card" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: index === 0 ? schemeConfConfig.bgColor : '#f5f5f7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Folder size={24} color={index === 0 ? schemeConfConfig.color : '#6e6e73'} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{scheme.schemeName}</h3>
                  {index === 0 && (
                    <span
                      style={{
                        padding: '4px 10px',
                        background: '#007aff',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      推荐
                    </span>
                  )}
                  <span
                    style={{
                      padding: '4px 10px',
                      background: schemeConfConfig.bgColor,
                      color: schemeConfConfig.color,
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    {schemeConfConfig.label}
                  </span>
                  {scheme.source === 'fallback' && (
                    <span
                      style={{
                        padding: '4px 10px',
                        background: '#6e6e73',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      基础规则
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '16px' }}>{scheme.reason}</p>

                <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
                  <Stat label="新建文件夹" value={scheme.suggestedFolders.length} />
                  <Stat label="预计移动" value={scheme.plannedMoves.length} />
                  <Stat label="不确定项" value={scheme.uncertainItems?.length || 0} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {scheme.suggestedFolders.map(folder => (
                    <span
                      key={folder}
                      style={{
                        padding: '6px 12px',
                        background: folder === '待确认文件' ? '#fff3cd' : '#f5f5f7',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: folder === '待确认文件' ? '#856404' : '#1d1d1f',
                        border: folder === '待确认文件' ? '1px solid #ffeaa7' : 'none',
                      }}
                    >
                      {folder}
                      {folder === '待确认文件' && (
                        <span style={{ marginLeft: '4px', fontSize: '11px' }}>⚠️</span>
                      )}
                    </span>
                  ))}
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => handleSelectScheme(scheme)}
                >
                  <span>选择此方案</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 说明 */}
      <div style={{ marginTop: '32px', padding: '16px', background: '#f5f5f7', borderRadius: '12px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
          📋 方案说明
        </h4>
        <ul style={{ fontSize: '13px', color: '#6e6e73', paddingLeft: '20px', margin: 0, lineHeight: '1.8' }}>
          <li><strong>按业务语义整理</strong>：适合业务特征明显的文件，如运营数据、产品方案等</li>
          <li><strong>按业务+类别整理</strong>：业务和类型都比较明显时的折中方案</li>
          <li><strong>按类别整理</strong>：保守方案，不猜测业务语义，适合各类混杂的场景</li>
          <li><strong>待确认文件</strong>：无法确定分类的文件，整理后需要您手动处理</li>
        </ul>
      </div>
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
