import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function ExecutingPage() {
  const navigate = useNavigate()
  const { adjustedScheme, scanResult, setCurrentTask, addToHistory } = useApp()
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('准备中...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adjustedScheme || !scanResult) {
      navigate('/')
      return
    }

    const execute = async () => {
      setStep('正在准备执行任务...')
      setProgress(10)

      try {
        // 构建任务数据
        const taskPayload = {
          taskId: Date.now().toString(),
          targetPath: scanResult.targetPath,
          scheme: adjustedScheme,
        }

        setStep('正在创建文件夹...')
        setProgress(30)

        // 调用真实的执行服务
        const result = await window.electronAPI!.executeTask(taskPayload)

        setProgress(80)
        setStep('正在记录执行结果...')

        if (result.success) {
          setProgress(100)
          setCurrentTask(result.result)
          addToHistory(result.result)
          
          // 延迟后跳转到结果页
          setTimeout(() => {
            navigate('/result')
          }, 500)
        } else {
          setError(result.error || '执行失败')
          setProgress(0)
        }
      } catch (err) {
        setError('执行过程中发生错误')
        setProgress(0)
      }
    }

    execute()
  }, [adjustedScheme, scanResult])

  if (error) {
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
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px', color: '#ff3b30' }}>
          执行失败
        </h2>
        <p style={{ fontSize: '16px', color: '#6e6e73', marginBottom: '24px' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          返回首页
        </button>
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
      <div
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: '#f5f5f7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '32px',
          position: 'relative',
        }}
      >
        <svg width="120" height="120" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e3e3e8" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#007aff"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress * 3.4} 340`}
            style={{ transition: 'stroke-dasharray 0.3s' }}
          />
        </svg>
        <span style={{ fontSize: '24px', fontWeight: 700, color: '#007aff' }}>{progress}%</span>
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>正在整理文件...</h2>
      <p style={{ fontSize: '16px', color: '#6e6e73', marginBottom: '32px' }}>{step}</p>

      <div style={{ width: '400px', background: 'white', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px' }}>总体进度</span>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{progress}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#f5f5f7', borderRadius: '3px' }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: '#007aff',
              borderRadius: '3px',
              transition: 'width 0.3s',
            }}
          />
        </div>
        <p style={{ fontSize: '13px', color: '#6e6e73', marginTop: '12px' }}>
          请勿关闭应用，正在操作真实文件...
        </p>
      </div>
    </div>
  )
}
