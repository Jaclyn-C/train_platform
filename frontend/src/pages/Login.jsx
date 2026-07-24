import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, Select, Tabs, message } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/stores/useAuthStore'
import './Login.css'

const { Title } = Typography

export default function Login() {
  const [activeTab, setActiveTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login, register } = useAuthStore()

  const handleLogin = async (values) => {
    setLoading(true)
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      navigate('/')
    } catch {
      message.error('用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (values) => {
    setLoading(true)
    try {
      await register(values.username, values.email, values.password, values.role)
      message.success('注册成功')
      navigate('/')
    } catch {
      message.error('注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        {/* Logo */}
        <div className="login-logo-section">
          <div className="login-logo-icon">AI</div>
          <Title level={4} style={{ marginBottom: 0 }}>
            算法训练平台
          </Title>
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form layout="vertical" onFinish={handleLogin} size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                      autoComplete="username"
                    />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码"
                      autoComplete="current-password"
                    />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      登 录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form layout="vertical" onFinish={handleRegister} size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                      autoComplete="username"
                    />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      placeholder="邮箱"
                      autoComplete="email"
                    />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少 6 位' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码（至少 6 位）"
                      autoComplete="new-password"
                    />
                  </Form.Item>
                  <Form.Item
                    name="role"
                    initialValue="engineer"
                    rules={[{ required: true, message: '请选择角色' }]}
                  >
                    <Select
                      options={[
                        { value: 'engineer', label: '算法工程师' },
                        { value: 'annotator', label: '标注人员' },
                        { value: 'admin', label: '管理员' },
                        { value: 'customer', label: '客户' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      注 册
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
