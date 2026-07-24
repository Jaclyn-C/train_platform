import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Input, Form, Select, message, Spin } from 'antd'
import { projectApi } from '@/api/projects'
import { teamApi } from '@/api/teams'
import './MyProjects.css'

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

// ── Placeholder stats (real data from future stages) ──
function computeStats() {
  return [
    { label: '模型', value: '暂无', cls: 'muted' },
    { label: 'mAP@50', value: '—', cls: 'muted' },
    { label: '数据集', value: '暂无数据', cls: '' },
    { label: '标注', value: '暂无', cls: 'muted' },
  ]
}

const PIPE_LABELS = ['数据', '标注', '训练', '评估', '部署', '迭代']

export default function MyProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [teams, setTeams] = useState([])
  const [newTeamName, setNewTeamName] = useState('')
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try { setProjects(await projectApi.getPersonal()) }
    catch { message.error('加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleCreate = async (v) => {
    setSubmitting(true)
    try {
      await projectApi.create({ name: v.name,
        park: localStorage.getItem('current_park') || 'ganzhou',
        task_type: localStorage.getItem('current_task_type') || 'detection',
      })
      message.success('算法已创建')
      setCreateOpen(false); form.resetFields(); load()
    } catch { message.error('创建失败') }
    finally { setSubmitting(false) }
  }

  const handleEdit = async (v) => {
    setSubmitting(true)
    try {
      await projectApi.update(editing.id, { name: v.name })
      await projectApi.share(editing.id, v.team_id || null)
      message.success(v.team_id ? '已共享到团队' : '已保存')
      setEditOpen(false); load()
    } catch { message.error('保存失败') }
    finally { setSubmitting(false) }
  }

  const openEdit = async (p, e) => {
    e.stopPropagation()
    setEditing(p)
    setShowNewTeam(false)
    setNewTeamName('')
    editForm.setFieldsValue({ name: p.name, team_id: p.team_id ? String(p.team_id) : '' })
    try { setTeams(await teamApi.list()) }
    catch { setTeams([]) }
    setEditOpen(true)
  }

  const createTeam = async () => {
    const name = newTeamName.trim()
    if (!name) { message.error('请输入团队名称'); return }
    try {
      const team = await teamApi.create(name)
      message.success(`团队「${name}」已创建`)
      setTeams((prev) => [...prev, team])
      editForm.setFieldsValue({ team_id: String(team.id) })
      setShowNewTeam(false)
      setNewTeamName('')
    } catch { message.error('创建团队失败') }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteInput !== deleteTarget.name) return
    try {
      await projectApi.delete(deleteTarget.id)
      message.success(`「${deleteTarget.name}」已删除`)
      setDeleteOpen(false); setDeleteTarget(null); setDeleteInput(''); load()
    } catch { message.error('删除失败') }
  }

  const openDelete = (p, e) => {
    e.stopPropagation()
    setDeleteTarget(p); setDeleteInput(''); setDeleteOpen(true)
  }

  const enter = (p) => {
    localStorage.setItem('current_project', String(p.id))
    localStorage.setItem('current_project_name', p.name)
    navigate('/data-center')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>

  return (
    <div>
      <div className="page-header">
        <h2>个人算法</h2>
        <button className="btn btn-primary" onClick={() => { form.resetFields(); setCreateOpen(true) }}>
          + 新建算法
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 14 }}>还没有个人算法</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            点击上方「+ 新建算法」创建你的第一个算法
          </div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => {
            const [c1, c2] = getCardColor(p.id)
            const stats = computeStats()
            const shared = !!p.team_id
            return (
              <div key={p.id} className="project-card" onClick={() => enter(p)}>
                {/* Header: icon + name + shared tag + stage tag */}
                <div className="p-header">
                  <div className="p-icon" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="p-name">
                      {p.name}
                      {shared && <span className="tag" style={{ background: '#e6f7ff', color: '#1890ff', marginLeft: 6 }}>共享</span>}
                    </div>
                    <div className="p-date">创建于 {p.created_at.slice(0, 10)}</div>
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
                  <span>
                    <button className="btn btn-default btn-sm" onClick={(e) => openEdit(p, e)}>编辑</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }}
                      onClick={(e) => openDelete(p, e)}>删除</button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create Modal ── */}
      <Modal title="新建个人算法" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()} confirmLoading={submitting} okText="确定" cancelText="取消"
        width={400}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="算法名称" rules={[{ required: true, message: '请输入算法名称' }]}>
            <Input placeholder="请输入算法名称" onKeyDown={(e) => e.key === 'Enter' && form.submit()} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal title="编辑算法" open={editOpen} onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()} confirmLoading={submitting} okText="保存" cancelText="取消"
        width={440}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="算法名称" rules={[{ required: true, message: '请输入算法名称' }]}>
            <Input placeholder="请输入算法名称" />
          </Form.Item>
          <Form.Item name="team_id" label="共享到团队">
            <Select
              allowClear
              placeholder="— 不共享（仅个人） —"
              options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
            />
          </Form.Item>
          {!showNewTeam ? (
            <button type="button" className="btn btn-text btn-sm"
              onClick={() => setShowNewTeam(true)}
              style={{ color: '#1890ff', marginBottom: 12 }}>
              + 新建团队
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="输入新团队名称"
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && createTeam()}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={createTeam}>创建</button>
              <button type="button" className="btn btn-default btn-sm" onClick={() => { setShowNewTeam(false); setNewTeamName('') }}>取消</button>
            </div>
          )}
        </Form>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal title="确认删除算法" open={deleteOpen} onCancel={() => { setDeleteOpen(false); setDeleteTarget(null) }}
        onOk={handleDelete} okButtonProps={{ danger: true, disabled: deleteInput !== deleteTarget?.name }}
        okText="确认删除" cancelText="取消" width={480}>
        <div style={{ marginBottom: 14, fontSize: 13 }}>
          确定要删除算法「<strong>{deleteTarget?.name}</strong>」吗？此操作<strong>不可撤销</strong>，请手动输入算法名称确认：
        </div>
        <Input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
          placeholder="请输入算法名称以确认删除" style={{ marginBottom: 14 }} />
        <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4, padding: 12, fontSize: 12 }}>
          <strong>以下内容将被一并删除：</strong><br />
          &emsp;→ 该算法下的全部数据集<br />
          &emsp;→ 全部标注数据<br />
          &emsp;→ 全部训练记录和模型文件<br />
          &emsp;→ 全部评估记录<br />
          &emsp;→ 全部部署记录和部署包
        </div>
      </Modal>
    </div>
  )
}
