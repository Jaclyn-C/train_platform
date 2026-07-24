import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Spin } from 'antd'
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

function isVideo(name) {
  return /\.(mp4|avi|mov|mkv|wmv|flv|webm)$/i.test(name)
}

function isImage(name) {
  return /\.(jpg|jpeg|png|bmp|gif|webp|jfif)$/i.test(name)
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
  const [submitting, setSubmitting] = useState(false)

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDs, setDetailDs] = useState(null)
  const [detailFiles, setDetailFiles] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Progress tracking
  const [progressDsId, setProgressDsId] = useState(null)
  const [progressData, setProgressData] = useState(null)
  const pollRef = useRef(null)

  // Extract config modal
  const [extractOpen, setExtractOpen] = useState(false)
  const [extractDs, setExtractDs] = useState(null)
  const [extractMode, setExtractMode] = useState('interval')
  const [extractInterval, setExtractInterval] = useState(30)
  const [extractQuality, setExtractQuality] = useState(85)

  // Dedup config modal
  const [dedupOpen, setDedupOpen] = useState(false)
  const [dedupDs, setDedupDs] = useState(null)
  const [dedupThreshold, setDedupThreshold] = useState(0.95)

  const projectId = Number(localStorage.getItem('current_project') || 0)
  const navigate = useNavigate()

  useEffect(() => () => clearInterval(pollRef.current), [])

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
      arr.forEach((f) => { if (!next.find((u) => u.name === f.name && u.size === f.size)) next.push(f) })
      return next
    })
  }

  const confirmUpload = async () => {
    if (!uploadedFiles.length) { message.error('请先选择文件'); return }
    setSubmitting(true)
    try {
      await datasetApi.upload(projectId, uploadStage, uploadedFiles)
      message.success(`已添加 ${uploadedFiles.length} 个文件到数据集管理`)
      setUploadedFiles([])
      load()
    } catch { message.error('上传失败') }
    finally { setSubmitting(false) }
  }

  // ── Process ──
  const handleExtract = async () => {
    const ds = extractDs
    setExtractOpen(false)
    setProgressDsId(ds.id)
    setProgressData({ status: 'starting' })
    try {
      await datasetApi.process(ds.id, 'extract', {
        mode: extractMode, interval_value: extractInterval, quality: extractQuality,
      })
      pollProgress(ds.id, 'extract')
    } catch { message.error('启动失败'); setProgressDsId(null); setProgressData(null) }
  }

  const handleDedup = async () => {
    const ds = dedupDs
    setDedupOpen(false)
    setProgressDsId(ds.id)
    setProgressData({ status: 'starting' })
    try {
      await datasetApi.process(ds.id, 'dedup', { similarity_threshold: dedupThreshold })
      pollProgress(ds.id, 'dedup')
    } catch { message.error('启动失败'); setProgressDsId(null); setProgressData(null) }
  }

  const pollProgress = (dsId, action) => {
    const checkAction = action === 'extract' ? 'check_extract' : 'check_dedup'
    pollRef.current = setInterval(async () => {
      try {
        const p = await datasetApi.process(dsId, checkAction)
        setProgressData(p)
        if (p.status === 'completed' || p.status === 'failed') {
          clearInterval(pollRef.current)
          if (p.status === 'completed') {
            message.success(action === 'extract' ? '抽帧完成' : '去重完成')
            load()
          } else { message.error(p.error || '处理失败') }
          setTimeout(() => { setProgressDsId(null); setProgressData(null) }, 3000)
        }
      } catch {}
    }, 2000)
  }

  const handleProcess = async (ds, action) => {
    setDetailOpen(false)
    setProgressDsId(ds.id)
    setProgressData({ status: 'starting' })
    try {
      await datasetApi.process(ds.id, action)
      pollProgress(ds.id, action)
    } catch { message.error('启动失败'); setProgressDsId(null); setProgressData(null) }
  }

  // ── Detail ──
  const openDetail = async (ds) => {
    setDetailDs(ds)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      if (ds.stage === 'raw_videos') {
        const data = await datasetApi.listFiles(ds.id)
        setDetailFiles(data.files || [])
      } else {
        const data = await datasetApi.listImages(ds.id)
        setDetailFiles(data.images?.map((p, i) => ({ name: p, size: 0, type: 'image', idx: i })) || [])
      }
    } catch { setDetailFiles([]) }
    finally { setDetailLoading(false) }
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

  if (!projectId) return <div className="empty-state"><div style={{ fontSize: 14 }}>请先选择一个算法</div></div>

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-header"><h2>数据中心</h2></div>

      {/* ===== Upload ===== */}
      <div className="card">
        <div className="card-header">
          文件上传
          <span className="text-secondary" style={{ fontWeight: 400, fontSize: 12 }}>
            支持视频（MP4、AVI、MOV）、图片（JPG、PNG）、文件夹拖拽，单文件最大 2GB
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div className={`upload-zone${dragover ? ' dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); handleFiles(e.dataTransfer.files) }}>
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
                  <button className="btn btn-primary btn-sm" onClick={confirmUpload} disabled={submitting}>{submitting ? '处理中...' : '确定'}</button>
                  <button className="btn btn-default btn-sm" onClick={() => fileInputRef.current?.click()}>继续添加</button>
                  <button className="btn btn-default btn-sm" onClick={() => setUploadedFiles([])}>清空全部</button>
                  <button className="btn btn-default btn-sm" onClick={load}>刷新列表</button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="搜索数据集名称..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', width: 200 }} />
              <button className="btn btn-default btn-sm" onClick={() => setSortAsc(!sortAsc)}>时间 {sortAsc ? '↑' : '↓'}</button>
            </div>
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>共 {filtered.length} 个批次 / {totalCards} 个数据集</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf' }}>还没有数据集。上传文件开始使用。</div>
          ) : (
            filtered.map((batch) => (
              <div key={batch.batch_name} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{batch.batch_name}</span>
                  <span className={`tag ${batch.status === '已完成' ? 'tag-success' : batch.status === '标注中' ? 'tag-processing' : 'tag-default'}`} style={{ fontSize: 10 }}>{batch.status}</span>
                </div>
                <div className="dataset-grid">
                  {batch.children.map((ds) => {
                    const cfg = STAGE_CONFIG[ds.stage] || { icon: '▣', iconClass: 'raw', badge: ds.status, badgeClass: 'done' }
                    return (
                      <div key={ds.id} className="dataset-card" onClick={() => openDetail(ds)}>
                        <div className={`ds-icon ${cfg.iconClass}`}>{cfg.icon}</div>
                        <div className="ds-name" title={ds.stage_label}>{ds.stage_label}</div>
                        <div className="ds-count">{ds.size_label}</div>
                        <div className="ds-date">{ds.created_at ? ds.created_at.slice(0, 10) : ''}</div>
                        <div className={`ds-badge ${cfg.badgeClass}`}>{cfg.badge}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          <button className="btn btn-default btn-sm" onClick={load} style={{ marginTop: 8 }}>刷新列表</button>
        </div>
      </div>

      {/* ===== Detail Modal ===== */}
      {detailOpen && detailDs && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetailOpen(false) }}>
          <div className="modal" style={{ width: detailDs.stage === 'raw_videos' ? 900 : 800, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header">
              <span>{detailDs.batch_name} {detailDs.stage_label} — 数据集详情</span>
              <button className="modal-close" onClick={() => setDetailOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 12, fontSize: 13 }}>{detailDs.size_label}</div>

              {/* File list for raw_videos */}
              {detailDs.stage === 'raw_videos' && (
                detailLoading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> :
                detailFiles.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: '#bfbfbf' }}>目录为空</div> :
                <table className="file-table">
                  <thead><tr>
                    <th style={{ width: 36 }}></th>
                    <th>文件名</th>
                    <th style={{ width: 90 }}>文件大小</th>
                    <th style={{ width: 90 }}>类型</th>
                  </tr></thead>
                  <tbody>
                    {detailFiles.map((f, i) => (
                      <tr key={i}>
                        <td className="file-icon-cell">
                          <div className={`ficon ${f.type === 'video' ? 'video' : 'image'}`}>{getFileIcon(f.name)}</div>
                        </td>
                        <td style={{ fontWeight: 500 }}>{f.name}</td>
                        <td>{f.size_label || formatSize(f.size)}</td>
                        <td>
                          <span className="tag" style={{ background: f.type === 'video' ? '#fff7e6' : '#e6f7ff', color: f.type === 'video' ? '#fa8c16' : '#1890ff' }}>
                            {f.type === 'video' ? '视频' : f.type === 'image' ? '图片' : '文件'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Image grid for other stages */}
              {detailDs.stage !== 'raw_videos' && (
                detailLoading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> :
                detailFiles.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: '#bfbfbf' }}>目录为空</div> :
                <div className="img-grid">
                  {detailFiles.map((f, i) => {
                    const fname = typeof f === 'string' ? f : f.name
                    const imgUrl = `/api/datasets/${detailDs.id}/image/${encodeURIComponent(fname)}`
                    return (
                      <div key={i} className="img-thumb" title={fname}
                        onDoubleClick={() => window.open(imgUrl, '_blank')}>
                        <img src={imgUrl} alt={fname}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                        <div style={{ width: '100%', height: '100%', background: `hsl(${i * 15}, 35%, 78%)`, display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                          {fname.split('/').pop()}
                        </div>
                        <div className="img-overlay">{fname.split('/').pop()}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                {detailDs.stage === 'raw_videos' && detailFiles.some(f => f.type === 'video') && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setDetailOpen(false); setExtractDs(detailDs); setExtractOpen(true) }}>抽帧</button>
                )}
                {detailDs.stage === 'extracted' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => { setDetailOpen(false); setDedupDs(detailDs); setDedupOpen(true) }}>去重</button>
                    <button className="btn btn-default btn-sm" onClick={() => handleProcess(detailDs, 'dedup')}>跳过去重</button>
                  </>
                )}
                {detailDs.stage === 'labeled' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleProcess(detailDs, 'split')}>导出 YOLO 并划分</button>
                )}
                {detailDs.stage === 'deduplicated' && (
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/annotation?dataset=${detailDs.id}`)}>创建标注任务</button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => { setDeleteTarget(detailDs); setDeleteOpen(true) }}>删除</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false) }}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-header">确认删除<button className="modal-close" onClick={() => setDeleteOpen(false)}>✕</button></div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 14, fontSize: 13 }}>确定要删除 <strong>{deleteTarget?.batch_name} {deleteTarget?.stage_label}</strong> 吗？此操作不可撤销。</div>
              <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 4, padding: 12, fontSize: 12 }}>
                <strong>以下内容将被一并删除：</strong><br />&emsp;→ 该数据集及下游所有数据
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default btn-sm" onClick={() => setDeleteOpen(false)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Frames Modal */}
      {extractOpen && extractDs && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setExtractOpen(false) }}>
          <div className="modal" style={{ width: 580 }}>
            <div className="modal-header">
              视频转图片 — <span>{extractDs.batch_name} files/</span>
              <button className="modal-close" onClick={() => setExtractOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div className="form-row" style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'flex-start' }}>
                <div className="form-group">
                  <label>抽帧方式</label>
                  <select value={extractMode} onChange={(e) => setExtractMode(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: 140 }}>
                    <option value="interval">按帧间隔</option>
                    <option value="time">按时间间隔</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{extractMode === 'time' ? '秒间隔' : '帧间隔'}</label>
                  <input type="number" value={extractInterval}
                    onChange={(e) => setExtractInterval(Number(e.target.value))} min={1}
                    style={{ padding: '7px 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: 120 }} />
                  <span className="input-hint" style={{ fontSize: 11, color: '#bfbfbf' }}>
                    {extractMode === 'time' ? `每 ${extractInterval} 秒抽取 1 帧` : `每 ${extractInterval} 帧抽取 1 帧`}
                  </span>
                </div>
                <div className="form-group">
                  <label>图片质量</label>
                  <select value={extractQuality} onChange={(e) => setExtractQuality(Number(e.target.value))}
                    style={{ padding: '7px 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: 140 }}>
                    <option value={95}>高质量 (95)</option>
                    <option value={85}>标准 (85)</option>
                    <option value={70}>低质量 (70)</option>
                  </select>
                </div>
              </div>

              {/* Progress */}
              {progressDsId === extractDs.id && progressData && (
                <div style={{ marginBottom: 16 }}>
                  {progressData.status === 'running' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>抽帧进度</span>
                        <span style={{ fontSize: 12, color: '#8c8c8c' }}>处理中...</span>
                      </div>
                      <div className="progress-bar" style={{ marginBottom: 4 }}>
                        <div className="fill" style={{ width: `${(progressData.processed / (progressData.total_videos || 1)) * 100}%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                        已处理: {progressData.processed}/{progressData.total_videos} 个视频
                        {progressData.current_video && <span> · 当前: {progressData.current_video}</span>}
                        {progressData.extracted != null && <span> · 已提取: {progressData.extracted} 帧</span>}
                      </div>
                    </>
                  )}
                  {progressData.status === 'completed' && (
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                      抽帧完成 — {progressData.extracted} 张图片 · {progressData.subfolder_count} 个子文件夹
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-primary btn-lg"
                onClick={handleExtract}
                disabled={progressDsId === extractDs.id && progressData?.status === 'running'}>
                {progressDsId === extractDs.id && progressData?.status === 'running' ? '抽帧中...' : '执行抽帧'}
              </button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => setExtractOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Dedup Modal */}
      {dedupOpen && dedupDs && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDedupOpen(false) }}>
          <div className="modal" style={{ width: 580 }}>
            <div className="modal-header">
              图片去重 — <span>{dedupDs.batch_name} extracted_frames/</span>
              <button className="modal-close" onClick={() => setDedupOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div className="form-row" style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'flex-start' }}>
                <div className="form-group">
                  <label>相似度阈值</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34 }}>
                    <input type="range" min={0.5} max={1} step={0.05}
                      value={dedupThreshold} onChange={(e) => setDedupThreshold(Number(e.target.value))}
                      style={{ width: 140 }} />
                    <span style={{ fontWeight: 600 }}>{dedupThreshold.toFixed(2)}</span>
                  </div>
                  <span className="input-hint" style={{ fontSize: 11, color: '#bfbfbf' }}>
                    数值越高，匹配越严，去重越少（推荐 0.7-0.9）
                  </span>
                </div>
              </div>

              {/* Progress */}
              {progressDsId === dedupDs.id && progressData && (
                <div style={{ marginBottom: 16 }}>
                  {progressData.status === 'running' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>去重进度</span>
                        <span style={{ fontSize: 12, color: '#8c8c8c' }}>处理中...</span>
                      </div>
                      <div className="progress-bar" style={{ marginBottom: 4 }}>
                        <div className="fill" style={{ width: `30%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                        已比对图片中...
                        {progressData.total != null && <span> · 共 {progressData.total} 张</span>}
                      </div>
                    </>
                  )}
                  {progressData.status === 'completed' && (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>去重结果</div>
                      <table className="file-table">
                        <thead><tr><th>指标</th><th>数值</th></tr></thead>
                        <tbody>
                          <tr><td>原始图片数</td><td>{progressData.total || '—'}</td></tr>
                          <tr><td>去重后图片数</td><td>{progressData.kept || '—'}</td></tr>
                          <tr><td>移除重复图片</td><td>{progressData.removed || '—'}</td></tr>
                          <tr><td>去重率</td><td>{progressData.dedup_rate != null ? `${progressData.dedup_rate}%` : '—'}</td></tr>
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-default btn-lg" onClick={() => { setDedupOpen(false); handleProcess(dedupDs, 'dedup') }}>跳过去重</button>
                <button className="btn btn-primary btn-lg"
                  onClick={handleDedup}
                  disabled={progressDsId === dedupDs.id && progressData?.status === 'running'}>
                  {progressDsId === dedupDs.id && progressData?.status === 'running' ? '去重中...' : '执行去重'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => setDedupOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
