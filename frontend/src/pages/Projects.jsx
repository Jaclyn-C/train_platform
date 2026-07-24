import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Spin, Empty } from 'antd'
import { projectApi } from '@/api/projects'
import { teamApi } from '@/api/teams'
import './Projects.css'

const CARD_COLORS = [
  ['#1890ff', '#36cfc9'],
  ['#fa8c16', '#f5222d'],
  ['#722ed1', '#eb2f96'],
  ['#52c41a', '#13c2c2'],
  ['#2f54eb', '#a0d911'],
]

function getCardColor(id) {
  return CARD_COLORS[(id || 0) % CARD_COLORS.length]
}

function computeStats() {
  return [
    { label: '模型', value: '暂无', cls: 'muted' },
    { label: 'mAP@50', value: '—', cls: 'muted' },
    { label: '数据集', value: '暂无数据', cls: '' },
    { label: '标注', value: '暂无', cls: 'muted' },
  ]
}

const PIPE_LABELS = ['数据', '标注', '训练', '评估', '部署', '迭代']

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamFilter, setTeamFilter] = useState('all')
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const [projData, teamData] = await Promise.all([
        projectApi.getTeam(),
        teamApi.list(),
      ])
      setProjects(projData)
      setTeams(teamData)
    } catch {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // Build team name lookup map
  const teamNameMap = {}
  teams.forEach((t) => { teamNameMap[t.id] = t.name })

  // Filter dropdown options — all teams, not just ones with projects
  const teamOptions = [
    { value: 'all', label: '全部团队' },
    ...teams.map((t) => ({ value: String(t.id), label: t.name })),
  ]

  const filtered = teamFilter === 'all'
    ? projects
    : projects.filter((p) => String(p.team_id) === teamFilter)

  const enter = (p) => {
    localStorage.setItem('current_project', String(p.id))
    localStorage.setItem('current_project_name', p.name)
    navigate('/data-center')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>

  return (
    <div>
      <div className="page-header">
        <h2>团队算法</h2>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          style={{
            padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 4,
            fontSize: 13, fontFamily: 'inherit', minWidth: 180,
          }}
        >
          {teamOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 14 }}>暂无共享的团队算法</div>
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((p) => {
            const [c1, c2] = getCardColor(p.id)
            const stats = computeStats()
            const teamName = teamNameMap[p.team_id] || ''
            return (
              <div key={p.id} className="project-card" onClick={() => enter(p)}>
                {/* Header */}
                <div className="p-header">
                  <div className="p-icon" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="p-name">{p.name}</div>
                    <div className="p-date">
                      创建于 {p.created_at.slice(0, 10)}
                      {teamFilter === 'all' && <span style={{ display: 'block', fontSize: 10, color: '#bfbfbf', marginTop: 2 }}>{teamName}</span>}
                    </div>
                  </div>
                  <span className="tag tag-warning" style={{ marginLeft: 'auto' }}>待开始</span>
                </div>

                {/* Pipeline */}
                <div className="pipeline">
                  {PIPE_LABELS.map((label, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <div className="pipe-step">
                        <div className="pipe-dot wait" />
                        <div className="pipe-label">{label}</div>
                      </div>
                      {i < 5 && <div className="pipe-arrow">→</div>}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="p-stats">
                  {stats.map((s) => (
                    <div key={s.label} className="p-stat-item">
                      <div className="p-stat-label">{s.label}</div>
                      <div className={`p-stat-value ${s.cls}`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}
                  onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-default btn-sm" onClick={() => enter(p)}>进入算法</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
