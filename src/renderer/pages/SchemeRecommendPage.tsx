import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState, useEffect } from 'react'
import { Folder, ArrowRight, RefreshCw, Info } from '../components/Icons'
import type { OrganizationScheme } from '@shared/types'

export default function SchemeRecommendPage() {
  const navigate = useNavigate()
  const { scanResult, modelConfig, setSelectedScheme } = useApp()
  const [schemes, setSchemes] = useState<OrganizationScheme[]>([])
  const [isGenerating, setIsGenerating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'model' | 'fallback'>('fallback')

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

      // 调用真实的模型服务
      const result = await window.electronAPI!.generateSchemes(scanResult, modelConfig)
      
      if (result.success && result.schemes) {
        setSchemes(result.schemes)
        setSource(result.source || 'fallback')
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

      {source === 'fallback' && (
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
        {schemes.map((scheme, index) => (
          <div key={scheme.schemeId} className="card" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: index === 0 ? '#007aff20' : '#f5f5f7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Folder size={24} color={index === 0 ? '#007aff' : '#6e6e73'} />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
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
                {(scheme as any).source === 'fallback' && (
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
                <Stat label="不确定项" value={scheme.uncertainItems.length} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {scheme.suggestedFolders.map(folder => (
                  <span
                    key={folder}
                    style={{
                      padding: '4px 10px',
                      background: '#f5f5f7',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#1d1d1f',
                    }}
                  >
                    {folder}
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
        ))}
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
