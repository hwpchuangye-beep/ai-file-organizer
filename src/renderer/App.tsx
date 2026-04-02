import { Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ModelConfigPage from './pages/ModelConfigPage'
import ScanResultPage from './pages/ScanResultPage'
import SchemeRecommendPage from './pages/SchemeRecommendPage'
import SchemeAdjustPage from './pages/SchemeAdjustPage'
import ExecuteConfirmPage from './pages/ExecuteConfirmPage'
import ExecutingPage from './pages/ExecutingPage'
import ResultPage from './pages/ResultPage'
import HistoryPage from './pages/HistoryPage'

function App() {
  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/model-config" element={<ModelConfigPage />} />
          <Route path="/scan-result" element={<ScanResultPage />} />
          <Route path="/scheme-recommend" element={<SchemeRecommendPage />} />
          <Route path="/scheme-adjust" element={<SchemeAdjustPage />} />
          <Route path="/execute-confirm" element={<ExecuteConfirmPage />} />
          <Route path="/executing" element={<ExecutingPage />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </Layout>
    </AppProvider>
  )
}

export default App
