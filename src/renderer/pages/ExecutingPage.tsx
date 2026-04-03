import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function ExecutingPage() {
  const navigate = useNavigate()
  const {
    approvedSchemeId,
    setCurrentTask,
    setCurrentReceipt,
    setVerificationReport,
    addToHistory,
  } = useApp()
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('准备中...')
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)
  const executedSchemeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!approvedSchemeId) {
      navigate('/execute-confirm')
      return
    }

    if (runningRef.current && executedSchemeRef.current === approvedSchemeId) {
      return
    }
    runningRef.current = true
    executedSchemeRef.current = approvedSchemeId
    let cancelled = false

    const execute = async () => {
      if (!window.electronAPI) {
        if (!cancelled) setError('Electron API 未初始化')
        return
      }

      if (!cancelled) {
        setStep('正在执行通过审批的整理计划...')
        setProgress(20)
      }

      const executeResult = await window.electronAPI.executeApprovedScheme({
        schemeId: approvedSchemeId,
      })

      if (!executeResult.success || !executeResult.task) {
        if (!cancelled) {
          setError(executeResult.error || '执行失败')
          setProgress(0)
        }
        return
      }

      if (!cancelled) {
        setCurrentTask(executeResult.task)
        setCurrentReceipt(executeResult.receipt || null)
        addToHistory(executeResult.task)
        setStep('正在逐文件验证落盘结果...')
        setProgress(75)
      }

      const verifyResult = await window.electronAPI.verifyExecutionTask({
        taskId: executeResult.task.taskId,
      })

      if (!verifyResult.success || !verifyResult.report) {
        if (!cancelled) {
          setError(verifyResult.error || '验证失败')
          setProgress(0)
        }
        return
      }

      if (!cancelled) {
        setVerificationReport(verifyResult.report)
        setProgress(100)
        setStep('执行与验证完成')
      }

      setTimeout(() => {
        if (!cancelled) navigate('/result')
      }, 400)
    }

    execute()
    return () => {
      cancelled = true
    }
  }, [approvedSchemeId, navigate, addToHistory, setCurrentReceipt, setCurrentTask, setVerificationReport])

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
          执行器与验证器正在处理真实文件
        </p>
      </div>
    </div>
  )
}
