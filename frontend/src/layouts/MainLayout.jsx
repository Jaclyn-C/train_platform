import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { Layout, Dropdown, Avatar, Breadcrumb, Select, Space, theme } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/useAuthStore'
import './MainLayout.css'

const { Header, Sider, Content } = Layout

const parkOptions = [
  { value: '', label: '— 请选择园区 —' },
  { value: 'ganzhou', label: '赣州' },
  { value: 'vietnam', label: '越南' },
]

const taskTypeOptions = [
  { value: '', label: '— 请选择任务 —' },
  { value: 'detection', label: '目标检测（YOLO）' },
  { value: 'pose', label: '姿态估计 — 规划中', disabled: true },
  { value: 'segment', label: '实例分割 — 规划中', disabled: true },
  { value: 'embedding', label: '文本嵌入 — 规划中', disabled: true },
]

const topNavItems = [
  { key: '/my-projects', icon: '📁', label: '个人算法' },
  { key: '/projects', icon: '👥', label: '团队算法' },
  { key: '/models', icon: '📊', label: '模型总览' },
  { key: '/models-use', icon: '🔍', label: '模型使用' },
  { key: '/training-queue', icon: '📋', label: '训练队列' },
]

const projectSubPages = [
  { key: '/data-center', icon: '📦', label: '数据中心' },
  { key: '/annotation', icon: '🏷', label: '数据标注' },
  { key: '/training', icon: '🏋', label: '模型训练' },
  { key: '/evaluation', icon: '📈', label: '模型评估' },
  { key: '/trial', icon: '🧪', label: '模型试用' },
  { key: '/deployment', icon: '🚀', label: '模型部署' },
]

const systemNavItems = [
  { key: '/team-manage', icon: '⚙', label: '团队管理' },
  { key: '/profile', icon: '👤', label: '个人中心' },
]

function pathLabel(segment) {
  const map = {
    'my-projects': '个人算法', 'projects': '团队算法',
    'data-center': '数据中心', 'annotation': '数据标注',
    'training': '模型训练', 'evaluation': '模型评估',
    'trial': '模型试用', 'deployment': '模型部署',
    'models': '模型总览', 'models-use': '模型使用',
    'training-queue': '训练队列', 'team-manage': '团队管理',
    'profile': '个人中心',
  }
  return map[segment] || segment
}

function SetupPrompt() {
  return (
    <div className="setup-prompt">
      <div className="sp-card">
        <div className="sp-title">请选择园区和模型任务</div>
        <div className="sp-desc">
          在顶部 <span className="sp-highlight">园区</span> 和{' '}
          <span className="sp-highlight">模型任务</span> 下拉框中做出选择
          <br />
          即可进入工作区
        </div>
      </div>
    </div>
  )
}

export default function MainLayout({ showProjectNav = false }) {
  const [collapsed, setCollapsed] = useState(
    localStorage.getItem('sidebar_collapsed') === 'true',
  )
  const [park, setPark] = useState(localStorage.getItem('current_park') || '')
  const [taskType, setTaskType] = useState(localStorage.getItem('current_task_type') || '')
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { token: themeToken } = theme.useToken()

  const isSetup = !park || !taskType
  const projectName = localStorage.getItem('current_project_name') || ''

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed))
  }, [collapsed])

  const handleParkChange = (value) => { setPark(value); localStorage.setItem('current_park', value) }
  const handleTaskTypeChange = (value) => { setTaskType(value); localStorage.setItem('current_task_type', value) }

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true,
      onClick: () => { logout(); navigate('/login') } },
  ]

  const breadcrumbLabel = location.pathname.split('/').filter(Boolean).map(pathLabel).join(' › ')

  // Helper: render a sidebar link
  const renderSidebarItem = (item, isActive) => (
    <a
      key={item.key}
      className={`sidebar-item${isActive ? ' active' : ''}`}
      href={item.key}
      data-icon={item.icon}
      onClick={(e) => { e.preventDefault(); navigate(item.key) }}
    >
      {item.label}
    </a>
  )

  return (
    <Layout className="main-layout">
      {/* ==================== Sidebar ==================== */}
      <Sider
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className={`main-sidebar${collapsed ? ' collapsed' : ''}`}
        trigger={null}
      >
        {/* Logo */}
        <div className={`sidebar-logo-area${collapsed ? ' collapsed' : ''}`}>
          <div className="sidebar-logo-icon" onClick={() => collapsed && setCollapsed(false)}
            title={collapsed ? '展开侧边栏' : undefined}>AI</div>
          {!collapsed && <span className="sidebar-logo-text">算法训练平台</span>}
          {!collapsed && (
            <button className="sidebar-collapse-btn" onClick={() => setCollapsed(true)}>◀</button>
          )}
        </div>

        {/* Nav — custom sidebar matching prototype exactly */}
        <nav className="sidebar-nav">
          {!isSetup && (
            <>
              {showProjectNav ? (
                <>
                  {/* ── 首页 ── */}
                  <div className="sidebar-group">
                    <a className="sidebar-item" href="/" data-icon="🏠"
                      onClick={(e) => { e.preventDefault(); navigate('/') }}>首页</a>
                  </div>

                  {/* ── 当前算法 ── */}
                  <div className="sidebar-group">
                    <div className="sidebar-group-title project-name-title">{projectName || '当前算法'}</div>
                    {projectSubPages.map((item) =>
                      renderSidebarItem(item, location.pathname.startsWith(item.key))
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* ── 平台导航 ── */}
                  <div className="sidebar-group">
                    <div className="sidebar-group-title">平台导航</div>
                    {topNavItems.map((item) =>
                      renderSidebarItem(item, location.pathname.startsWith(item.key))
                    )}
                  </div>

                  {/* ── 系统设置 ── */}
                  <div className="sidebar-group">
                    <div className="sidebar-group-title">系统设置</div>
                    {systemNavItems.map((item) =>
                      renderSidebarItem(item, location.pathname.startsWith(item.key))
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </nav>
      </Sider>

      {/* ==================== Main Area ==================== */}
      <Layout>
        <Header className="main-header">
          {isSetup ? (
            <span className="main-breadcrumb-placeholder" />
          ) : (
            <Breadcrumb className="main-breadcrumb"
              items={[{ title: <Link to="/">首页</Link> }, { title: breadcrumbLabel }]} />
          )}

          <div className="header-actions">
            <Space size={4}>
              <span className="header-select-label">园区</span>
              <Select size="small" value={park || undefined} onChange={handleParkChange}
                options={parkOptions} className="header-park-select" placeholder="请选择园区" />
            </Space>
            <Space size={4}>
              <span className="header-select-label">模型任务</span>
              <Select size="small" value={taskType || undefined} onChange={handleTaskTypeChange}
                options={taskTypeOptions} className="header-task-select" placeholder="请选择任务" />
            </Space>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="user-menu-trigger">
                <Avatar size={28} style={{ backgroundColor: themeToken.colorPrimary, verticalAlign: 'middle' }}>
                  {user?.avatar || user?.name?.charAt(0) || 'U'}
                </Avatar>
                <span className="user-menu-name">{user?.name || '用户'}</span>
              </Space>
            </Dropdown>
          </div>
        </Header>

        <Content className={`main-content${isSetup ? ' is-setup' : ''}`}>
          {isSetup ? <SetupPrompt /> : <Outlet />}
        </Content>
      </Layout>
    </Layout>
  )
}
