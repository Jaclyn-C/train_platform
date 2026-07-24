import { Card, Row, Col, Typography } from 'antd'
import {
  AppstoreOutlined,
  TeamOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

const { Title, Paragraph } = Typography

const quickLinks = [
  {
    title: '个人算法',
    description: '创建和管理个人算法项目',
    icon: <AppstoreOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
    path: '/my-projects',
  },
  {
    title: '团队算法',
    description: '查看团队共享的算法项目',
    icon: <TeamOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    path: '/projects',
  },
  {
    title: '模型总览',
    description: '浏览和管理所有模型',
    icon: <DatabaseOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    path: '/models',
  },
  {
    title: '训练队列',
    description: '查看训练任务状态和进度',
    icon: <ThunderboltOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
    path: '/training-queue',
  },
]

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="dashboard-welcome">
        <Title level={3} style={{ marginBottom: 8 }}>
          欢迎使用算法训练平台
        </Title>
        <Paragraph type="secondary">
          一站式管理算法项目的标注、训练、评估和部署流程
        </Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        {quickLinks.map((link) => (
          <Col xs={24} sm={12} lg={6} key={link.path}>
            <Card
              hoverable
              className="dashboard-link-card"
              onClick={() => navigate(link.path)}
            >
              <div className="dashboard-link-icon">{link.icon}</div>
              <Title level={5}>{link.title}</Title>
              <Paragraph type="secondary">{link.description}</Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
