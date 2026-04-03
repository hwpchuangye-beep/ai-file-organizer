import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Monitor, Download, Folder, AlertCircle, CheckCircle, Wrench, X, RefreshCw, FolderOpen, ArrowRight } from '../components/Icons'
import { useEffect, useState } from 'react'

export default function HomePage() {
  const navigate = useNavigate()
  const { modelConfig, setDirectoryProfile } = useApp()
  const [isScanning, setIsScanning] = useState(false)
  
  // Electron API 就绪检查
  const [apiReady, setApiReady] = useState(false)
  const [apiCheckCount, setApiCheckCount] = useState(0)
  
  // 隐藏目录检测与修复
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [repairPreview, setRepairPreview] = useState<any[]>([])
  const [isRepairing, setIsRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<any>(null)
  const [pendingScanPath, setPendingScanPath] = useState<string | null>(null)
  const [pendingSourceType, setPendingSourceType] = useState<'desktop' | 'downloads' | 'user_selected' | 'watched'>('user_selected')

  // 等待 Electron API 就绪
  useEffect(() => {
    const checkApi = () => {
      if (window.electronAPI) {
        console.log('[HomePage] electronAPI is ready');
        setApiReady(true);
        return true;
      }
      return false;
    };
    
    // 立即检查一次
    if (checkApi()) return;
    
    // 如果未就绪，每秒检查一次，最多检查 10 次
    let attempts = 0;
    const maxAttempts = 10;
    
    const interval = setInterval(() => {
      attempts++;
      setApiCheckCount(attempts);
      
      if (checkApi() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  // 暂时禁用自动跳转，先确保首页能显示
  // useEffect(() => {
  //   if (!modelConfig && apiReady) {
  //     navigate('/model-config')
  //   }
  // }, [modelConfig, navigate, apiReady])

  const handleCheckDesktop = async () => {
    if (!window.electronAPI) return
    const desktopPath = await window.electronAPI.getDesktopPath()
    await checkAndScan(desktopPath, 'desktop')
  }

  const handleCheckDownloads = async () => {
    if (!window.electronAPI) return
    const downloadsPath = await window.electronAPI.getDownloadsPath()
    await checkAndScan(downloadsPath, 'downloads')
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    const selectedPath = await window.electronAPI.selectDirectory()
    if (selectedPath) {
      await checkAndScan(selectedPath, 'user_selected')
    }
  }

  // 检查隐藏目录并决定下一步
  const checkAndScan = async (
    targetPath: string,
    sourceType: 'desktop' | 'downloads' | 'user_selected' | 'watched',
  ) => {
    if (!window.electronAPI) return
    
    setPendingScanPath(targetPath)
    setPendingSourceType(sourceType)
    
    // 先检测隐藏目录
    const previewResult = await window.electronAPI.generateRepairPreview(targetPath)
    
    if (previewResult.success && previewResult.preview && previewResult.preview.length > 0) {
      // 发现隐藏目录，显示修复弹窗
      setRepairPreview(previewResult.preview)
      setShowRepairModal(true)
    } else {
      // 没有隐藏目录，直接扫描
      await performScan(targetPath, sourceType)
    }
  }

  // 执行扫描
  const performScan = async (
    targetPath: string,
    sourceType: 'desktop' | 'downloads' | 'user_selected' | 'watched' = 'user_selected',
  ) => {
    if (!window.electronAPI) return
    
    setIsScanning(true)
    const result = await window.electronAPI.buildDirectoryProfile({ targetPath, sourceType })
    
    if (result.success && result.profile) {
      setDirectoryProfile(result.profile)
      setIsScanning(false)
      navigate('/scan-result')
    } else {
      setIsScanning(false)
      alert('扫描失败: ' + (result.error || '未知错误'))
    }
  }

  // 执行修复
  const handleRepair = async () => {
    if (!window.electronAPI || !pendingScanPath) return
    
    setIsRepairing(true)
    const result = await window.electronAPI.repairHiddenDirectories(pendingScanPath)
    setRepairResult(result)
    setIsRepairing(false)
    
    if (result.success) {
      setTimeout(() => {
        setShowRepairModal(false)
        setRepairPreview([])
        setRepairResult(null)
        performScan(pendingScanPath, pendingSourceType)
      }, 1500)
    }
  }

  // 跳过修复
  const handleSkipRepair = () => {
    setShowRepairModal(false)
    if (pendingScanPath) {
      performScan(pendingScanPath, pendingSourceType)
    }
  }

  // 关闭弹窗
  const closeModal = () => {
    setShowRepairModal(false)
    setRepairPreview([])
    setRepairResult(null)
    setPendingScanPath(null)
    setPendingSourceType('user_selected')
  }

  const isConnected = modelConfig?.isConnected

  // 如果 API 未就绪，显示加载状态
  if (!apiReady) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e3e3e8',
            borderTopColor: '#007aff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px',
          }}
        />
        <p style={{ fontSize: '16px', color: '#1d1d1f', fontWeight: 500 }}>
          正在初始化应用...
        </p>
        <p style={{ fontSize: '13px', color: '#6e6e73', marginTop: '8px' }}>
          等待 Electron API 就绪 ({apiCheckCount}/10)
        </p>
        {apiCheckCount >= 10 && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#ff3b30' }}>
              初始化超时，请重启应用
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '12px',
                padding: '10px 20px',
                background: '#007aff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        )}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: 'linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1
          style={{
            fontSize: '42px',
            fontWeight: 700,
            marginBottom: '12px',
            background: 'linear-gradient(135deg, #007aff, #5856d6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          AI 文件整理助手
        </h1>
        <p style={{ fontSize: '18px', color: '#6e6e73', maxWidth: '500px' }}>
          智能扫描、分析并整理您的文件，让桌面和下载文件夹保持整洁有序
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '40px',
          padding: '12px 20px',
          background: isConnected ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
          borderRadius: '20px',
        }}
      >
        {isConnected ? (
          <>
            <CheckCircle size={16} color="#34c759" />
            <span style={{ fontSize: '14px', color: '#34c759', fontWeight: 500 }}>
              已连接: {modelConfig?.modelName}
            </span>
          </>
        ) : (
          <>
            <AlertCircle size={16} color="#ff3b30" />
            <span style={{ fontSize: '14px', color: '#ff3b30', fontWeight: 500 }}>
              模型未连接
            </span>
          </>
        )}
        <button
          onClick={() => navigate('/model-config')}
          style={{
            marginLeft: '8px',
            padding: '4px 12px',
            fontSize: '13px',
            background: 'transparent',
            border: '1px solid currentColor',
            borderRadius: '12px',
            cursor: 'pointer',
            color: isConnected ? '#34c759' : '#ff3b30',
          }}
        >
          {isConnected ? '切换模型' : '去配置'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '900px' }}>
        <ActionCard
          icon={<Monitor size={32} color="#007aff" />}
          title="检查我的桌面"
          description="扫描桌面文件，识别堆积和混乱"
          onClick={handleCheckDesktop}
          disabled={!isConnected || isScanning}
        />
        <ActionCard
          icon={<Download size={32} color="#34c759" />}
          title="整理下载文件夹"
          description="清理下载目录，分类归档文件"
          onClick={handleCheckDownloads}
          disabled={!isConnected || isScanning}
        />
        <ActionCard
          icon={<Folder size={32} color="#5856d6" />}
          title="选择文件夹开始"
          description="手动选择任意文件夹进行整理"
          onClick={handleSelectFolder}
          disabled={!isConnected || isScanning}
        />
      </div>

      {/* 隐藏目录修复弹窗 */}
      {showRepairModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* 弹窗头部 */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(255, 59, 48, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Wrench size={20} color="#ff3b30" />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>发现历史隐藏目录</h3>
                  <p style={{ fontSize: '13px', color: '#6e6e73', margin: '2px 0 0' }}>
                    {repairPreview.length} 个目录需要修复
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                }}
              >
                <X size={20} color="#6e6e73" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div style={{ padding: '20px 24px' }}>
              {!repairResult ? (
                <>
                  <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '16px', lineHeight: 1.6 }}>
                    检测到以下以前导点开头的隐藏目录。这些目录在 Finder 中默认不可见，可能导致您误以为文件丢失。
                    建议修复为可见目录名后再进行整理。
                  </p>

                  {/* 修复预览列表 */}
                  <div
                    style={{
                      background: '#f5f5f7',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      marginBottom: '20px',
                    }}
                  >
                    {repairPreview.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '14px 16px',
                          borderBottom: index < repairPreview.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(255, 59, 48, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <FolderOpen size={16} color="#ff3b30" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                color: '#ff3b30',
                                fontFamily: 'monospace',
                                background: 'rgba(255, 59, 48, 0.08)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {item.originalName}
                            </span>
                            <ArrowRight size={14} color="#6e6e73" />
                            <span
                              style={{
                                fontSize: '13px',
                                color: '#34c759',
                                fontWeight: 500,
                                background: 'rgba(52, 199, 89, 0.08)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {item.finalName}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#6e6e73' }}>
                            {item.hasConflict ? (
                              <span style={{ color: '#ff9500' }}>
                                因"{item.proposedName}"已存在，将命名为"{item.finalName}"
                              </span>
                            ) : (
                              <span>可直接重命名，包含 {item.fileCount} 个文件</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={handleSkipRepair}
                      style={{
                        flex: 1,
                        padding: '12px 20px',
                        background: '#f5f5f7',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 500,
                        color: '#1d1d1f',
                        cursor: 'pointer',
                      }}
                    >
                      暂不修复
                    </button>
                    <button
                      onClick={handleRepair}
                      disabled={isRepairing}
                      style={{
                        flex: 1,
                        padding: '12px 20px',
                        background: '#007aff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 500,
                        color: 'white',
                        cursor: isRepairing ? 'not-allowed' : 'pointer',
                        opacity: isRepairing ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      {isRepairing ? (
                        <>
                          <RefreshCw size={16} spin={true} />
                          修复中...
                        </>
                      ) : (
                        <>
                          <Wrench size={16} />
                          一键修复
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                /* 修复结果 */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  {repairResult.success ? (
                    <>
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '50%',
                          background: 'rgba(52, 199, 89, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 16px',
                        }}
                      >
                        <CheckCircle size={32} color="#34c759" />
                      </div>
                      <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#34c759' }}>
                        修复成功
                      </h4>
                      <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '16px' }}>
                        成功修复 {repairResult.repaired?.length || 0} 个隐藏目录
                      </p>
                      <p style={{ fontSize: '13px', color: '#9ca3af' }}>即将开始扫描...</p>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '50%',
                          background: 'rgba(255, 59, 48, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 16px',
                        }}
                      >
                        <AlertCircle size={32} color="#ff3b30" />
                      </div>
                      <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#ff3b30' }}>
                        修复失败
                      </h4>
                      <p style={{ fontSize: '14px', color: '#6e6e73', marginBottom: '16px' }}>
                        {repairResult.message || '部分目录修复失败'}
                      </p>
                      <button
                        onClick={() => setRepairResult(null)}
                        style={{
                          padding: '10px 20px',
                          background: '#f5f5f7',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        返回重试
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 扫描中遮罩 */}
      {isScanning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '32px 48px',
              borderRadius: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '3px solid #e3e3e8',
                borderTopColor: '#007aff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ fontSize: '16px', fontWeight: 500 }}>正在扫描文件...</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  )
}

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}

function ActionCard({ icon, title, description, onClick, disabled }: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 24px',
        background: 'white',
        border: 'none',
        borderRadius: '16px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        minWidth: '220px',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.08)'
      }}
    >
      <div style={{ marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '14px', color: '#6e6e73', textAlign: 'center' }}>{description}</p>
    </button>
  )
}
