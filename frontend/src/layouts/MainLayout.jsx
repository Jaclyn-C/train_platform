import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  Layout,
  Menu,
  Dropdown,
  Avatar,
  Breadcrumb,
  Select,
  Space,
  theme,
} from 'antd'
import {
  TeamOutlined,
  AppstoreOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  UserOutlined,
  DatabaseOutlined,
  TagOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  RocketOutlined,
  LogoutOutlined,
  GithubOutlined,
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
  { key: '/my-projects', icon: <AppstoreOutlined />, label: '个人算法' },
  { key: '/projects', icon: <TeamOutlined />, label: '团队算法' },
  { key: '/models', icon: <BarChartOutlined />, label: '模型总览' },
  { key: '/models-use', icon: <SearchOutlined />, label: '模型使用' },
  { key: '/training-queue', icon: <UnorderedListOutlined />, label: '训练队列' },
]

const projectNavItems = [
  { key: '/data-center', icon: <DatabaseOutlined />, label: '数据中心' },
  { key: '/annotation', icon: <TagOutlined />, label: '数据标注' },
  { key: '/training', icon: <ThunderboltOutlined />, label: '模型训练' },
  { key: '/evaluation', icon: <BarChartOutlined />, label: '模型评估' },
  { key: '/trial', icon: <ExperimentOutlined />, label: '模型试用' },
  { key: '/deployment', icon: <RocketOutlined />, label: '模型部署' },
]

const systemNavItems = [
  { key: '/team-manage', icon: <SettingOutlined />, label: '团队管理' },
  { key: '/profile', icon: <UserOutlined />, label: '个人中心' },
]

function pathLabel(segment) {
  const map = {
    'my-projects': '个人算法',
    'projects': '团队算法',
    'data-center': '数据中心',
    'annotation': '数据标注',
    'training': '模型训练',
    'evaluation': '模型评估',
    'trial': '模型试用',
    'deployment': '模型部署',
    'models': '模型总览',
    'models-use': '模型使用',
    'training-queue': '训练队列',
    'team-manage': '团队管理',
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

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed))
  }, [collapsed])

  const handleParkChange = (value) => {
    setPark(value)
    localStorage.setItem('current_park', value)
  }

  const handleTaskTypeChange = (value) => {
    setTaskType(value)
    localStorage.setItem('current_task_type', value)
  }

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => {
        logout()
        navigate('/login')
      },
    },
  ]

  const selectedTopKey = topNavItems
    .map((i) => i.key)
    .find((k) => location.pathname.startsWith(k))
  const selectedProjectKey = projectNavItems
    .map((i) => i.key)
    .find((k) => location.pathname.startsWith(k))

  const breadcrumbLabel = location.pathname
    .split('/')
    .filter(Boolean)
    .map(pathLabel)
    .join(' › ')

  // Sidebar menu: during setup, sidebar is empty; after setup, show all nav
  const sidebarMenuItems = isSetup
    ? []
    : [
        {
          key: 'platform',
          type: 'group',
          label: collapsed ? '' : '平台导航',
          children: topNavItems,
        },
        ...(showProjectNav
          ? [
              {
                key: 'current-project',
                type: 'group',
                label: collapsed ? '' : '当前算法',
                children: [
                  {
                    key: 'project-name',
                    icon: <GithubOutlined />,
                    label: localStorage.getItem('current_project_name') || '未选择算法',
                    disabled: true,
                  },
                  ...projectNavItems,
                ],
              },
            ]
          : []),
        {
          key: 'system',
          type: 'group',
          label: collapsed ? '' : '系统设置',
          children: systemNavItems,
        },
      ]

  return (
    <Layout className="main-layout">
      {/* ---- Sidebar ---- */}
      <Sider
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="main-sidebar"
        trigger={null}
      >
        {/* Logo */}
        <div className={`sidebar-logo-area${collapsed ? ' collapsed' : ''}`}>
          <div
            className="sidebar-logo-icon"
            onClick={() => collapsed && setCollapsed(false)}
            title={collapsed ? '展开侧边栏' : undefined}
          >
            AI
          </div>
          {!collapsed && <span className="sidebar-logo-text">算法训练平台</span>}
          {!collapsed && (
            <button className="sidebar-collapse-btn" onClick={() => setCollapsed(true)}>
              ◀
            </button>
          )}
        </div>

        {/* Nav */}
        <div className="sidebar-nav-wrap">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedTopKey, selectedProjectKey].filter(Boolean)}
            items={sidebarMenuItems}
            onClick={({ key }) => {
              if (key && !key.startsWith('project-name')) navigate(key)
            }}
          />
        </div>
      </Sider>

      {/* ---- Main Area ---- */}
      <Layout>
        {/* Header */}
        <Header className="main-header">
          {isSetup ? (
            <span className="main-breadcrumb-placeholder" />
          ) : (
            <Breadcrumb
              className="main-breadcrumb"
              items={[
                { title: <Link to="/">首页</Link> },
                { title: breadcrumbLabel },
              ]}
            />
          )}

          <div className="header-actions">
            {/* Park Selector */}
            <Space size={4}>
              <span className="header-select-label">园区</span>
              <Select
                size="small"
                value={park || undefined}
                onChange={handleParkChange}
                options={parkOptions}
                className="header-park-select"
                placeholder="请选择园区"
              />
            </Space>

            {/* Task Type Selector */}
            <Space size={4}>
              <span className="header-select-label">模型任务</span>
              <Select
                size="small"
                value={taskType || undefined}
                onChange={handleTaskTypeChange}
                options={taskTypeOptions}
                className="header-task-select"
                placeholder="请选择任务"
              />
            </Space>

            {/* User Menu */}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="user-menu-trigger">
                <Avatar
                  size={28}
                  style={{
                    backgroundColor: themeToken.colorPrimary,
                    verticalAlign: 'middle',
                  }}
                >
                  {user?.avatar || user?.name?.charAt(0) || 'U'}
                </Avatar>
                <span className="user-menu-name">{user?.name || '用户'}</span>
              </Space>
            </Dropdown>
          </div>
        </Header>

        {/* Content */}
        <Content className={`main-content${isSetup ? ' is-setup' : ''}`}>
          {isSetup ? <SetupPrompt /> : <Outlet />}
        </Content>
      </Layout>
    </Layout>
  )
}
