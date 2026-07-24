import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Select, message, Spin } from 'antd'
import { datasetApi } from '@/api/datasets'
import './DataCenter.css'

const STAGE_CONFIG = {
  raw_videos:   { icon: '▶', iconClass: 'raw', badge: '原始数据', badgeClass: 'done' },
  extracted:    { icon: '▣', iconClass: 'raw', badge: '已处理', badgeClass: 'done' },
  deduplicated: { icon: '▦', iconClass: 'dedup', badge: '已去重', badgeClass: 'done' },
  labeled:      { icon: '▣', iconClass: 'labeled', badge: '已标注', badgeClass: 'done' },
  train:        { icon: '⊞', iconClass: 'train', badge: '训练集', badgeClass: 'done' },
  val:          { icon: '◇', iconClass: 'val', badge: '验证集', badgeClass: 'done' },
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function getFileIcon(name) {
  const ext = (name || '').toLowerCase()
  if (/\.(mp4|avi|mov|mkv|wmv|flv|webm)$/.test(ext)) return '▶'
  if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(ext)) return '▣'
  return '📄'
}

export default function DataCenter() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadStage, setUploadStage] = useState('raw_videos')
  const [dragover, setDragover] = useState(false)
  const fileInputRef = useRef(null)
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDs, setDetailDs] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const projectId = Number(localStorage.getItem('current_project') || 0)
  const navigate = useNavigate()

  const load = async () => {
    if (!projectId) return
    setLoading(true)
    try { setBatches(await datasetApi.listBatches(projectId)) }
    catch { message.error('加载数据集失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [projectId])

  // ── Upload ──
  const handleFiles = (files) => {
    if (!files || !files.length) return
    const arr = Array.from(files)
    setUploadedFiles((prev) => {
      const next = [...prev]
      arr.forEach((f) => {
        if (!next.find((u) => u.name === f.name && u.size === f.size)) next.push(f)
      })
      return next
    })
  }

  const confirmUpload = async () => {
    if (!uploadedFiles.length) { message.error('请先选择文件'); return }
    setSubmitting(true)
    try {
      await datasetApi.upload(projectId, uploadStage, uploadedFiles)
      message.success(`已添加为 ${uploadStage === 'raw_videos' ? 'files/' : uploadStage + '/'}，已添加到数据集管理`)
      setUploadedFiles([])
      load()
    } catch { message.error('上传失败') }
    finally { setSubmitting(false) }
  }

  // ── Process ──
  const handleProcess = async (ds, action) => {
    setSubmitting(true)
    try {
      await datasetApi.process(ds.id, action)
      const labels = { extract: '抽帧完成', dedup: '去重完成', split: '划分完成' }
      message.success(labels[action] || '操作完成')
      setDetailOpen(false)
      load()
    } catch { message.error('操作失败') }
    finally { setSubmitting(false) }
  }

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await datasetApi.delete(deleteTarget.id)
      message.success('已删除')
      setDeleteOpen(false)
      setDetailOpen(false)
      load()
    } catch { message.error('删除失败') }
  }

  // ── Search / Sort ──
  let filtered = batches
  if (search) {
    const q = search.toLowerCase()
    filtered = batches.filter((b) =>
      b.batch_name.toLowerCase().includes(q) ||
      b.children.some((c) => (c.stage_label || '').includes(q) || (c.size_label || '').includes(q))
    )
  }
  filtered = [...filtered].sort((a, b) => {
    const cmp = (a.batch_date || '').localeCompare(b.batch_date || '')
    return sortAsc ? cmp : -cmp
  })

  const totalCards = filtered.reduce((s, b) => s + b.children.length, 0)

  if (!projectId) {
    return <div className="empty-state"><div style={{ fontSize: 14 }}>请先选择一个算法</div></div>
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-header">
        <h2>数据中心</h2>
      </div>

      {/* ===== Upload Zone ===== */}
      <div className="card">
        <div className="card-header">
          文件上传
          <span className="text-secondary" style={{ fontWeight: 400, fontSize: 12 }}>
            支持视频（MP4、AVI、MOV）、图片（JPG、PNG）、文件夹拖拽，单文件最大 2GB
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div
              className={`upload-zone${dragover ? ' dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); handleFiles(e.dataTransfer.files) }}
            >
              <div className="upload-icon">+</div>
              <div className="upload-text">点击或拖拽上传</div>
              <div className="upload-hint">视频 / 图片 / 文件夹</div>
            </div>
            <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple
              style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />

            {uploadedFiles.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  已选择的文件（<span>{uploadedFiles.length}</span> 个）
                </div>
                <div className="file-list">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="file-item">
                      <span className="file-icon">{getFileIcon(f.name)}</span>
                      <div className="file-info">
                        <div className="file-name">{f.name}</div>
                        <div className="file-meta">{formatSize(f.size)}</div>
                      </div>
                      <span className="file-status"><span className="tag tag-default" style={{ fontSize: 11 }}>待处理</span></span>
                      <button className="file-remove" onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>上传为：</span>
                  <select value={uploadStage} onChange={(e) => setUploadStage(e.target.value)}
                    style={{ padding: '5px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, fontFamily: 'inherit' }}>
                    <option value="raw_videos">files/（原始文件）</option>
                    <option value="extracted">extracted_frames/（抽帧图片）</option>
                    <option value="deduplicated">deduplicated/（去重后图片）</option>
                    <option value="labeled">labeled/（已标注数据）</option>
                    <option value="train">train/（训练集）</option>
                    <option value="val">val/（验证集）</option>
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={confirmUpload} disabled={submitting}>
                    {submitting ? '处理中...' : '确定'}
                  </button>
                  <button className="btn btn-default btn-sm" onClick={() => fileInputRef.current?.click()}>继续添加</button>
                  <button className="btn btn-default btn-sm" onClick={() => setUploadedFiles([])}>清空全部</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Dataset Management ===== */}
      <div className="card">
        <div className="card-header">数据集管理</div>
        <div className="card-body">
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="搜索数据集名称..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', width: 200 }} />
              <button className="btn btn-default btn-sm" onClick={() => setSortAsc(!sortAsc)}>时间 {sortAsc ? '↑' : '↓'}</button>
            </div>
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>共 {filtered.length} 个批次 / {totalCards} 个数据集</span>
          </div>

          {/* Dataset cards grouped by batch */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf' }}>没有匹配的数据集</div>
          ) : (
            filtered.map((batch) => (
              <div key={batch.batch_name} style={{ marginBottom: 24 }}>
                {/* Batch header */}
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{batch.batch_name}</span>
                  <span className={`tag ${batch.status === '已完成' ? 'tag-success' : batch.status === '标注中' ? 'tag-processing' : 'tag-default'}`} style={{ fontSize: 10 }}>
                    {batch.status}
                  </span>
                </div>

                {/* Dataset grid — one row per batch */}
                <div className="dataset-grid">
                  {batch.children.map((ds) => {
                    const cfg = STAGE_CONFIG[ds.stage] || { icon: '▣', iconClass: 'raw', badge: ds.status, badgeClass: 'done' }
                    return (
                      <div key={ds.id} className="dataset-card"
                        onClick={() => { setDetailDs(ds); setDetailOpen(true) }}>
                        <div className={`ds-icon ${cfg.iconClass}`}>{cfg.icon}</div>
                        <div className="ds-name" title={ds.stage_label}>{ds.stage_label}</div>
                        <div className="ds-count">{ds.size_label}</div>
                        <div className="ds-date">{ds.created_at ? ds.created_at.slice(0, 10) + (ds.stage.match(/extract|dedup|label|train|val/) ? ' 生成' : ' 上传') : ''}</div>
                        <div className={`ds-badge ${cfg.badgeClass}`}>{cfg.badge}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {detailOpen && detailDs && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetailOpen(false) }}>
          <div className="modal" style={{ width: 700 }}>
            <div className="modal-header">
              <span>{detailDs.batch_name} {detailDs.stage_label} — 数据集详情</span>
              <button className="modal-close" onClick={() => setDetailOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p><strong>类型：</strong>{detailDs.stage_label}</p>
              <p><strong>数量：</strong>{detailDs.size_label}</p>
              <p><strong>状态：</strong>{detailDs.status || '未知'}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                {detailDs.stage === 'raw_videos' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleProcess(detailDs, 'extract')}>抽帧</button>
                )}
                {detailDs.stage === 'extracted' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleProcess(detailDs, 'dedup')}>去重</button>
                )}
                {detailDs.stage === 'labeled' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleProcess(detailDs, 'split')}>导出 YOLO 并划分</button>
                )}
                {detailDs.stage === 'deduplicated' && (
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/annotation?dataset=${detailDs.id}`)}>
                    {detailDs.auto_status === 'review' ? '审核修正标注' : '创建标注任务'}
                  </button>
                )}
                <button className="btn btn-default btn-sm">导出 ZIP</button>
                <button className="btn btn-danger btn-sm" onClick={() => {
                  setDeleteTarget(detailDs)
                  setDeleteOpen(true)
                }}>删除</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete Modal ===== */}
      {deleteOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false) }}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-header">确认删除<button className="modal-close" onClick={() => setDeleteOpen(false)}>✕</button></div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 14, fontSize: 13 }}>确定要删除 <strong>{deleteTarget?.batch_name} {deleteTarget?.stage_label}</strong> 吗？此操作不可撤销。</div>
              <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4, padding: 12, fontSize: 12 }}>
                <strong>以下内容将被一并删除：</strong><br />
                &emsp;→ 该数据集的所有数据
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default btn-sm" onClick={() => setDeleteOpen(false)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
