import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/useAuthStore'
import MainLayout from '@/layouts/MainLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import MyProjects from '@/pages/MyProjects'
import Projects from '@/pages/Projects'
import DataCenter from '@/pages/DataCenter'
import Annotation from '@/pages/Annotation'
import NotFound from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AuthGuard({ children }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { fetchUser, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser()
    }
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Top-level pages (no project context) */}
      <Route
        element={
          <AuthGuard>
            <MainLayout showProjectNav={false} />
          </AuthGuard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="my-projects" element={<MyProjects />} />
        <Route path="projects" element={<Projects />} />
        <Route path="models" element={<div>模型总览 — 开发中</div>} />
        <Route path="models-use" element={<div>模型使用 — 开发中</div>} />
        <Route path="training-queue" element={<div>训练队列 — 开发中</div>} />
        <Route path="team-manage" element={<div>团队管理 — 开发中</div>} />
        <Route path="profile" element={<div>个人中心 — 开发中</div>} />
      </Route>

      {/* Project-level pages (with project nav in sidebar) */}
      <Route
        element={
          <AuthGuard>
            <MainLayout showProjectNav={true} />
          </AuthGuard>
        }
      >
        <Route path="data-center" element={<DataCenter />} />
        <Route path="annotation" element={<Annotation />} />
        <Route path="training" element={<div>模型训练 — 开发中</div>} />
        <Route path="evaluation" element={<div>模型评估 — 开发中</div>} />
        <Route path="trial" element={<div>模型试用 — 开发中</div>} />
        <Route path="deployment" element={<div>模型部署 — 开发中</div>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
          },
        }}
      >
        <AntApp>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
