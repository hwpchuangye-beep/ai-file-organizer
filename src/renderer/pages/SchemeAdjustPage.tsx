import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useState } from 'react'
import { ArrowRight, ChevronLeft, X, Folder } from '../components/Icons'

export default function SchemeAdjustPage() {
  const navigate = useNavigate()
  const { selectedScheme, setAdjustedScheme } = useApp()
  const [excludedFiles, setExcludedFiles] = useState<string[]>([])
  const [excludedFolders, setExcludedFolders] = useState<string[]>([])

  if (!selectedScheme) {
    navigate('/scheme-recommend')
    return null
  }

  const handleContinue = () => {
    const adjusted = {
      ...selectedScheme,
      plannedMoves: selectedScheme.plannedMoves.filter(
        m => !excludedFiles.includes(m.file.path)
      ),
    }
    setAdjustedScheme(adjusted)
    navigate('/execute-confirm')
  }

  return (
    <div className="page-container">
      <h1 className="page-title">方案微调</h1>
      <p className="page-subtitle">调整整理方案的细节，排除不需要处理的文件</p>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px' }}>建议的文件夹结构</h3>
        <div style={{ padding: '16px', background: '#f5f5f7', borderRadius: '8px' }}>
          {selectedScheme.suggestedFolders.map(folder => (
            <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
              <Folder size={18} color="#007aff" />
              <span>{folder}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px' }}>
          预计移动的文件 ({selectedScheme.plannedMoves.length})
        </h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {selectedScheme.plannedMoves.map((move, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: excludedFiles.includes(move.file.path) ? '#f5f5f7' : 'transparent',
                borderRadius: '8px',
                marginBottom: '8px',
                opacity: excludedFiles.includes(move.file.path) ? 0.5 : 1,
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{move.file.name}</div>
                <div style={{ fontSize: '12px', color: '#6e6e73' }}>→ {move.targetFolder}</div>
              </div>
              <button
                onClick={() => {
                  if (excludedFiles.includes(move.file.path)) {
                    setExcludedFiles(excludedFiles.filter(p => p !== move.file.path))
                  } else {
                    setExcludedFiles([...excludedFiles, move.file.path])
                  }
                }}
                style={{
                  padding: '6px 12px',
                  background: excludedFiles.includes(move.file.path) ? '#34c759' : '#ff3b30',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {excludedFiles.includes(move.file.path) ? '恢复' : '排除'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/scheme-recommend')}>
          <ChevronLeft size={18} />
          <span>返回选择</span>
        </button>
        <button className="btn btn-primary" onClick={handleContinue}>
          <span>继续确认</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
