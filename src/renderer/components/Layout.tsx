import { useNavigate, useLocation } from 'react-router-dom'
import { Settings, History, Home } from './Icons'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const showHeader = !['/', '/executing'].includes(location.pathname)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showHeader && (
        <header
          style={{
            height: '52px',
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            WebkitAppRegion: 'drag' as any,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', WebkitAppRegion: 'no-drag' as any }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: '#007aff',
              }}
              title="返回首页"
            >
              <Home size={20} />
            </button>
            <h1 style={{ fontSize: '15px', fontWeight: 600 }}>AI文件整理助手</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' as any }}>
            <button
              onClick={() => navigate('/history')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: location.pathname === '/history' ? '#007aff' : '#6e6e73',
              }}
              title="历史记录"
            >
              <History size={20} />
            </button>
            <button
              onClick={() => navigate('/model-config')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: location.pathname === '/model-config' ? '#007aff' : '#6e6e73',
              }}
              title="设置"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
