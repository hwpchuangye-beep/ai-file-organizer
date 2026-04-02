import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Cpu, Cloud, CheckCircle, AlertCircle, ArrowRight, Info, RefreshCw, Edit3 } from '../components/Icons'
import type { ModelConfig } from '@shared/types'

export default function ModelConfigPage() {
  const navigate = useNavigate()
  const { modelConfig, setModelConfig } = useApp()
  
  const [mode, setMode] = useState<'local' | 'cloud'>(modelConfig?.mode || 'local')
  const [baseUrl, setBaseUrl] = useState(modelConfig?.baseUrl || 'http://127.0.0.1:1234')
  const [modelName, setModelName] = useState(modelConfig?.modelName || '')
  const [apiKey, setApiKey] = useState(modelConfig?.apiKey || '')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // 模型列表状态
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [manualInput, setManualInput] = useState(false)

  // 组件加载时，如果有已保存的配置，尝试加载模型列表
  useEffect(() => {
    if (modelConfig?.isConnected && modelConfig.baseUrl) {
      fetchModels(modelConfig.baseUrl, modelConfig.apiKey || '')
    }
  }, [])

  const fetchModels = async (url: string, key: string) => {
    setIsLoadingModels(true)
    const result = await window.electronAPI!.getModels({
      baseUrl: url.replace(/\/$/, ''),
      apiKey: key,
    })
    if (result.success && result.models) {
      setAvailableModels(result.models)
      // 如果当前没有选中的模型，默认选第一个
      if (!modelName && result.models.length > 0) {
        setModelName(result.models[0])
      }
    }
    setIsLoadingModels(false)
    return result
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    const config = {
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey,
    }

    // 测试连接
    const result = await window.electronAPI!.testModelConnection(config)
    setTestResult(result)
    
    // 如果连接成功，自动获取模型列表
    if (result.success && result.models) {
      setAvailableModels(result.models)
      // 优先保留已保存的模型，否则选第一个
      const savedModel = modelConfig?.modelName
      if (savedModel && result.models.includes(savedModel)) {
        setModelName(savedModel)
      } else if (result.models.length > 0) {
        setModelName(result.models[0])
      }
    }
    
    setIsTesting(false)
  }

  const handleRefreshModels = async () => {
    await fetchModels(baseUrl, apiKey)
  }

  const handleSave = () => {
    const config: ModelConfig = {
      mode,
      baseUrl: baseUrl.replace(/\/$/, ''),
      modelName,
      apiKey,
      isConnected: testResult?.success || modelConfig?.isConnected || false,
      lastCheckedAt: new Date().toISOString(),
    }
    setModelConfig(config)
    navigate('/')
  }

  // 是否有可用的模型列表
  const hasModelList = availableModels.length > 0

  return (
    <div className="page-container">
      <h1 className="page-title">模型配置</h1>
      <p className="page-subtitle">配置 AI 模型连接，支持本地、局域网和云端模型</p>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
            连接模式
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <ModeButton
              active={mode === 'local'}
              onClick={() => setMode('local')}
              icon={<Cpu size={20} />}
              label="本地模型"
              description="127.0.0.1 或 localhost"
            />
            <ModeButton
              active={mode === 'cloud'}
              onClick={() => setMode('cloud')}
              icon={<Cloud size={20} />}
              label="云端模型"
              description="远程 API 服务"
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
            API 地址
          </label>
          <input
            type="text"
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={mode === 'local' ? 'http://127.0.0.1:1234' : 'https://api.example.com'}
          />
          <p style={{ fontSize: '13px', color: '#6e6e73', marginTop: '6px' }}>
            {mode === 'local' 
              ? '支持: http://127.0.0.1:1234, http://localhost:1234, http://192.168.x.x:1234'
              : '填写云端模型服务的完整 API 地址'}
          </p>
        </div>

        {mode === 'cloud' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              API Key
            </label>
            <input
              type="password"
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500 }}>
              选择模型
            </label>
            {hasModelList && !manualInput && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleRefreshModels}
                  disabled={isLoadingModels}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#007aff',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    opacity: isLoadingModels ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} style={{ animation: isLoadingModels ? 'spin 1s linear infinite' : undefined }} />
                  刷新
                </button>
                <button
                  onClick={() => setManualInput(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#6e6e73',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                  }}
                >
                  <Edit3 size={12} />
                  手动输入
                </button>
              </div>
            )}
            {manualInput && (
              <button
                onClick={() => setManualInput(false)}
                style={{
                  fontSize: '12px',
                  color: '#007aff',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                }}
              >
                返回选择
              </button>
            )}
          </div>
          
          {manualInput ? (
            <input
              type="text"
              className="input"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="输入模型名称，如 qwen/qwen3-8b"
            />
          ) : (
            <select
              className="input"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              disabled={!hasModelList}
              style={{
                cursor: hasModelList ? 'pointer' : 'not-allowed',
                backgroundColor: hasModelList ? 'white' : '#f5f5f7',
              }}
            >
              {!hasModelList && (
                <option value="">
                  {isLoadingModels ? '加载中...' : '请先测试连接获取模型列表'}
                </option>
              )}
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
          
          {hasModelList && !manualInput && (
            <p style={{ fontSize: '13px', color: '#6e6e73', marginTop: '6px' }}>
              已获取 {availableModels.length} 个可用模型
            </p>
          )}
        </div>

        <div
          style={{
            padding: '12px 16px',
            background: '#f5f5f7',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <Info size={16} color="#6e6e73" />
          <p style={{ fontSize: '13px', color: '#6e6e73' }}>
            若使用局域网模型，请确保模型服务允许局域网访问并开放对应端口。
            例如 LM Studio 需要在设置中开启 "Serve on Local Network"。
          </p>
        </div>

        {testResult && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: testResult.success ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
            }}
          >
            {testResult.success ? (
              <CheckCircle size={18} color="#34c759" />
            ) : (
              <AlertCircle size={18} color="#ff3b30" />
            )}
            <span style={{ fontSize: '14px', color: testResult.success ? '#34c759' : '#ff3b30' }}>
              {testResult.message}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting || !baseUrl}
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!modelName}
          >
            <span>保存配置</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

interface ModeButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  description: string
}

function ModeButton({ active, onClick, icon, label, description }: ModeButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '16px',
        border: `2px solid ${active ? '#007aff' : '#e3e3e8'}`,
        borderRadius: '10px',
        background: active ? 'rgba(0, 122, 255, 0.05)' : 'white',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ color: active ? '#007aff' : '#6e6e73' }}>{icon}</div>
      <span style={{ fontSize: '15px', fontWeight: 600, color: active ? '#007aff' : '#1d1d1f' }}>
        {label}
      </span>
      <span style={{ fontSize: '12px', color: '#6e6e73' }}>{description}</span>
    </button>
  )
}
