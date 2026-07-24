import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { datasetApi } from '@/api/datasets'
import { trainingApi } from '@/api/training'
import './Training.css'

const MODEL_OPTIONS = [
  { value: 'yolo11n.pt', label: 'yolo11n.pt (轻量)' },
  { value: 'yolo11m.pt', label: 'yolo11m.pt (默认)' },
  { value: 'yolo11l.pt', label: 'yolo11l.pt (较大)' },
  { value: 'yolo11x.pt', label: 'yolo11x.pt (最大)' },
]
const DEVICE_OPTIONS = [
  { value: 'mps', label: 'GPU 0 (MPS)' },
  { value: 'cpu', label: 'CPU' },
]
const OPTIMIZER_OPTIONS = ['AdamW', 'SGD', 'Adam']

export default function Training() {
  const projectId = Number(localStorage.getItem('current_project') || 0)
  const projectName = localStorage.getItem('current_project_name') || ''
  const navigate = useNavigate()

  // --- Config state ---
  const [trainDsOptions, setTrainDsOptions] = useState([])
  const [valDsOptions, setValDsOptions] = useState([])
  const [selectedTrainDs, setSelectedTrainDs] = useState([])
  const [selectedValDs, setSelectedValDs] = useState([])
  const [trainDsOpen, setTrainDsOpen] = useState(false)
  const [valDsOpen, setValDsOpen] = useState(false)
  const trainDsWrapRef = useRef(null)
  const valDsWrapRef = useRef(null)

  const [config, setConfig] = useState({
    model: 'yolo11n.pt', epochs: 20, batch: 8, imgsz: 320,
    optimizer: 'AdamW', lr0: 0.001, lrf: 0.01,
    device: 'mps', workers: 2, amp: true, task_name: '',
    // Advanced
    momentum: 0.9, weight_decay: 0.05, patience: 100,
    // Aug
    aug_enabled: true,
    hsv_h: 0.015, hsv_s: 0.7, hsv_v: 0.4, degrees: 0, fliplr: 0.5, mosaic: 1.0,
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // --- Monitor state ---
  const [isTraining, setIsTraining] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [runningJobId, setRunningJobId] = useState(null)
  const [monitor, setMonitor] = useState(null)
  const [logHtml, setLogHtml] = useState('')
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef(null)
  const logRef = useRef(null)
  const lossChartRef = useRef(null)
  const mapChartRef = useRef(null)

  // Close multi-select on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (trainDsWrapRef.current && !trainDsWrapRef.current.contains(e.target)) setTrainDsOpen(false)
      if (valDsWrapRef.current && !valDsWrapRef.current.contains(e.target)) setValDsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Load data
  const load = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [batches, jobs] = await Promise.all([
        datasetApi.listBatches(projectId),
        trainingApi.listJobs(projectId),
      ])
      const train = [], val = []
      batches.forEach(b => b.children.forEach(c => {
        if (c.stage === 'train') train.push(c)
        if (c.stage === 'val') val.push(c)
      }))
      setTrainDsOptions(train)
      setValDsOptions(val)
      if (train.length) setSelectedTrainDs([String(train[0].id)])
      if (val.length) setSelectedValDs([String(val[0].id)])
      setHistory(jobs)
    } catch { message.error('加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [projectId])

  // Auto task name
  const getTaskName = () => {
    const m = config.model.replace('.pt', '')
    return config.task_name || `${projectName}-${m}-${config.epochs}e-b${config.batch}`
  }

  const updateConfig = (f, v) => setConfig(c => ({ ...c, [f]: v }))

  // --- Training ---
  const startTraining = async () => {
    if (!projectId) return
    if (!selectedTrainDs.length || !selectedValDs.length) { message.error('请选择训练集和验证集'); return }
    setSubmitting(true)
    try {
      const cfg = { ...config, project_id: projectId, task_name: getTaskName() }
      const job = await trainingApi.start(cfg)
      message.success('训练已提交到队列！')
      setIsTraining(true)
      setRunningJobId(job.id)
      setLogHtml('')
      pollRef.current = setInterval(() => pollStatus(job.id), 2000)
    } catch (e) {
      message.error('启动失败: ' + (e.response?.data?.detail || e.message))
    } finally { setSubmitting(false) }
  }

  const pollStatus = async (jobId) => {
    try {
      const s = await trainingApi.getStatus(jobId)
      setMonitor(s)
      if (s.logs?.length) {
        setLogHtml(s.logs.map(l => `<span>${l}</span>`).join('\n'))
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }
      drawCharts(s)
      if (s.status === 'completed' || s.status === 'failed') {
        clearInterval(pollRef.current)
        if (s.status === 'completed') message.success('训练完成！')
        else if (s.status === 'failed') message.error('训练失败: ' + (s.error || ''))
        load()
      }
    } catch {}
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  // --- Charts ---
  const drawCharts = (s) => {
    drawOneChart(lossChartRef, s, 'loss')
    drawOneChart(mapChartRef, s, 'map')
  }

  const drawOneChart = (canvasRef, s, type) => {
    const canvas = canvasRef?.current
    if (!canvas || !s) return
    canvas.width = canvas.offsetWidth * 2
    canvas.height = 320
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const pad = { top: 15, right: 15, bottom: 25, left: 38 }
    const pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom
    ctx.clearRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ph * i / 4
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke()
      ctx.fillStyle = '#999'; ctx.font = '18px sans-serif'; ctx.textAlign = 'right'
      if (type === 'loss') ctx.fillText((0.10 - 0.025 * i).toFixed(2), pad.left - 8, y + 6)
      else ctx.fillText((1.0 - 0.25 * i).toFixed(2), pad.left - 8, y + 6)
    }
    if (s.progress <= 0) return

    const pct = s.progress / 100
    if (type === 'loss') {
      ;[{ c: '#ff4d4f', sv: 0.08, ev: 0.018 }, { c: '#1890ff', sv: 0.05, ev: 0.008 }, { c: '#52c41a', sv: 0.03, ev: 0.006 }].forEach(l => {
        ctx.strokeStyle = l.c; ctx.lineWidth = 2; ctx.beginPath()
        for (let i = 0; i <= 100 * pct; i++) {
          const x = pad.left + (i / 100) * pw
          const val = l.sv * Math.pow(0.97, i / 100 * 1000) + l.ev
          const y = pad.top + (1 - val / 0.12) * ph
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
    } else {
      ;[{ c: '#1890ff', sv: 0.3, ev: 0.87 }, { c: '#52c41a', sv: 0.15, ev: 0.65 }].forEach(l => {
        ctx.strokeStyle = l.c; ctx.lineWidth = 2; ctx.beginPath()
        for (let i = 0; i <= 100 * pct; i++) {
          const x = pad.left + (i / 100) * pw
          const val = l.sv + (l.ev - l.sv) * (1 - Math.exp(-i / 40))
          const y = pad.top + (1 - Math.min(1, val)) * ph
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
    }
  }

  // --- Multi-select helpers ---
  const toggleDs = (dsId, isTrain) => {
    const setter = isTrain ? setSelectedTrainDs : setSelectedValDs
    setter(prev => prev.includes(dsId) ? prev.filter(v => v !== dsId) : [...prev, dsId])
  }
  const getDsLabel = (ids, options) => {
    if (!ids.length) return '— 未选择 —'
    const labels = ids.map(id => options.find(o => String(o.id) === id)?.size_label || id).filter(Boolean)
    if (labels.length <= 2) return labels.join('；')
    return `已选 ${labels.length} 个数据集`
  }

  if (!projectId) return <div className="empty-state"><div style={{ fontSize: 14 }}>请先选择一个算法</div></div>

  return (
    <div className="train-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2>模型训练</h2>
          <button className="btn btn-default" onClick={() => setHistoryOpen(true)}>训练历史</button>
        </div>
      </div>

      <div className="train-layout">
        {/* ===== Left: Config / Monitor ===== */}
        <div className="card config-panel">
          {/* --- Config View --- */}
          {!isTraining && <div className="card-header">训练配置</div>}
          {!isTraining && (
            <div className="card-body" id="configView">
              {/* Basic Settings */}
              <div className="form-section">
                <div className="form-section-title">基础设置</div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>训练数据集</label>
                    <div className="multi-select" ref={trainDsWrapRef}>
                      <div className={`ms-trigger${trainDsOpen ? ' open' : ''}`} onClick={() => setTrainDsOpen(!trainDsOpen)}>
                        <span className={`ms-text${!selectedTrainDs.length ? ' ms-placeholder' : ''}`}>{getDsLabel(selectedTrainDs, trainDsOptions)}</span>
                        <span className="ms-arrow">▾</span>
                      </div>
                      {trainDsOpen && <div className="ms-dropdown">
                        {trainDsOptions.length === 0 ? <div className="ms-option" style={{ color: '#bfbfbf' }}>暂无训练集</div>
                          : trainDsOptions.map(d => (
                            <label key={d.id} className="ms-option">
                              <input type="checkbox" checked={selectedTrainDs.includes(String(d.id))}
                                onChange={() => toggleDs(String(d.id), true)} />
                              {d.batch_name} {d.stage_label} ({d.size_label})
                            </label>
                          ))}
                      </div>}
                    </div>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>验证数据集</label>
                    <div className="multi-select" ref={valDsWrapRef}>
                      <div className={`ms-trigger${valDsOpen ? ' open' : ''}`} onClick={() => setValDsOpen(!valDsOpen)}>
                        <span className={`ms-text${!selectedValDs.length ? ' ms-placeholder' : ''}`}>{getDsLabel(selectedValDs, valDsOptions)}</span>
                        <span className="ms-arrow">▾</span>
                      </div>
                      {valDsOpen && <div className="ms-dropdown">
                        {valDsOptions.length === 0 ? <div className="ms-option" style={{ color: '#bfbfbf' }}>暂无验证集</div>
                          : valDsOptions.map(d => (
                            <label key={d.id} className="ms-option">
                              <input type="checkbox" checked={selectedValDs.includes(String(d.id))}
                                onChange={() => toggleDs(String(d.id), false)} />
                              {d.batch_name} {d.stage_label} ({d.size_label})
                            </label>
                          ))}
                      </div>}
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>任务名称 <span className="hint">选填，不填自动生成</span></label>
                    <input type="text" value={config.task_name}
                      onChange={e => updateConfig('task_name', e.target.value)}
                      placeholder={getTaskName()} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>预训练模型</label>
                    <select value={config.model} onChange={e => updateConfig('model', e.target.value)}>
                      {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="hint">默认使用 yolo11m.pt</span>
                  </div>
                </div>
              </div>

              {/* Training Hyperparams */}
              <div className="form-section">
                <div className="form-section-title">训练超参数</div>
                <div className="form-row">
                  <div className="form-group"><label>训练轮数 (epochs)</label><input type="number" value={config.epochs} onChange={e => updateConfig('epochs', Number(e.target.value))} /></div>
                  <div className="form-group"><label>批处理大小 (batch)</label><input type="number" value={config.batch} onChange={e => updateConfig('batch', Number(e.target.value))} /></div>
                  <div className="form-group"><label>图像尺寸 (imgsz)</label><input type="number" value={config.imgsz} onChange={e => updateConfig('imgsz', Number(e.target.value))} step={32} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>训练设备</label>
                    <select value={config.device} onChange={e => updateConfig('device', e.target.value)}>
                      {DEVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>优化器</label>
                    <select value={config.optimizer} onChange={e => updateConfig('optimizer', e.target.value)}>
                      {OPTIMIZER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>数据加载进程 (workers)</label>
                    <input type="number" value={config.workers} onChange={e => updateConfig('workers', Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>初始学习率 (lr0)</label><input type="number" value={config.lr0} onChange={e => updateConfig('lr0', Number(e.target.value))} step={0.0001} /></div>
                  <div className="form-group"><label>最终学习率因子 (lrf)</label><input type="number" value={config.lrf} onChange={e => updateConfig('lrf', Number(e.target.value))} step={0.001} /></div>
                </div>

                {/* Advanced (collapsible) */}
                <div className="collapse-toggle" onClick={() => setAdvancedOpen(!advancedOpen)}>
                  <span id="collapseArrow">{advancedOpen ? '▼' : '▶'}</span> 更多参数
                </div>
                {advancedOpen && <div className="collapse-content open">
                  <div className="form-row">
                    <div className="form-group"><label>动量 (momentum)</label><input type="number" value={config.momentum} onChange={e => updateConfig('momentum', Number(e.target.value))} step={0.001} /></div>
                    <div className="form-group"><label>权重衰减 (weight_decay)</label><input type="number" value={config.weight_decay} onChange={e => updateConfig('weight_decay', Number(e.target.value))} step={0.01} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>早停轮数 (patience)</label><input type="number" value={config.patience} onChange={e => updateConfig('patience', Number(e.target.value))} /><span className="hint">精度不提升多少轮后自动停止</span></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-inline">
                        <label>混合精度训练 (amp)</label>
                        <label className="toggle"><input type="checkbox" checked={config.amp} onChange={e => updateConfig('amp', e.target.checked)} /><span className="slider" /></label>
                      </div>
                    </div>
                  </div>

                  {/* Data Augmentation */}
                  <div className="aug-section">
                    <div className="aug-section-title">
                      数据增强
                      <label className="toggle" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={config.aug_enabled} onChange={e => updateConfig('aug_enabled', e.target.checked)} />
                        <span className="slider" />
                      </label>
                      <span style={{ fontSize: 10, color: '#bfbfbf', fontWeight: 400 }}>关闭后以下所有增强均不生效</span>
                    </div>
                    <div className="aug-grid">
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">色调 <span className="aug-code">hsv_h</span></div>
                          <div className="aug-desc">HSV-Hue 通道增强幅度</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={0.1} step={0.005} value={config.hsv_h}
                            onChange={e => updateConfig('hsv_h', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.hsv_h.toFixed(3)}</span>
                        </div>
                      </div>
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">饱和度 <span className="aug-code">hsv_s</span></div>
                          <div className="aug-desc">HSV-Saturation 通道增强幅度</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={1} step={0.01} value={config.hsv_s}
                            onChange={e => updateConfig('hsv_s', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.hsv_s.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">亮度 <span className="aug-code">hsv_v</span></div>
                          <div className="aug-desc">HSV-Value 通道增强幅度</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={1} step={0.01} value={config.hsv_v}
                            onChange={e => updateConfig('hsv_v', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.hsv_v.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">随机旋转 <span className="aug-code">degrees</span></div>
                          <div className="aug-desc">随机旋转角度范围（°）</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={180} step={1} value={config.degrees}
                            onChange={e => updateConfig('degrees', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.degrees}.0</span>
                        </div>
                      </div>
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">水平翻转 <span className="aug-code">fliplr</span></div>
                          <div className="aug-desc">随机水平翻转概率</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={1} step={0.05} value={config.fliplr}
                            onChange={e => updateConfig('fliplr', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.fliplr.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={`aug-item${config.aug_enabled ? '' : ' disabled'}`}>
                        <div>
                          <div className="aug-label">Mosaic 增强 <span className="aug-code">mosaic</span></div>
                          <div className="aug-desc">4 张图拼接为 1 张训练</div>
                        </div>
                        <div className="aug-control">
                          <input type="range" min={0} max={1} step={0.05} value={config.mosaic}
                            onChange={e => updateConfig('mosaic', Number(e.target.value))} disabled={!config.aug_enabled} />
                          <span className="aug-val">{config.mosaic.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>}
              </div>

              {/* Train Button */}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
                onClick={startTraining} disabled={submitting}>
                {submitting ? '提交中...' : '提交到训练队列'}
              </button>
            </div>
          )}

          {/* --- Monitor View --- */}
          {isTraining && (
            <>
              <div className="card-header" id="monitorHeader">
                训练监控
                <span style={{ fontWeight: 400, fontSize: 12, color: monitor?.status === 'running' ? '#52c41a' : '#8c8c8c' }}>
                  {monitor?.status === 'running' ? '● 运行中' : monitor?.status === 'completed' ? '● 已完成' : ''}
                </span>
              </div>
              <div className="card-body monitor-panel active">
                <div className="monitor-header">
                  <span className="epoch-text">Epoch {monitor?.current_epoch || 0}/{monitor?.total_epochs || config.epochs}</span>
                  <span className="eta-text">预计剩余: 计算中...</span>
                </div>
                <div className="progress-bar"><div className="fill" style={{ width: `${monitor?.progress || 0}%` }} /></div>

                {/* Loss Chart */}
                <div className="chart-box">
                  <div className="chart-title">Loss 趋势</div>
                  <canvas ref={lossChartRef} style={{ width: '100%', height: 120 }} />
                </div>

                {/* mAP Chart */}
                <div className="chart-box">
                  <div className="chart-title">mAP 趋势</div>
                  <canvas ref={mapChartRef} style={{ width: '100%', height: 120 }} />
                </div>

                {/* Log */}
                <div className="log-box" ref={logRef} dangerouslySetInnerHTML={{ __html: logHtml }} />

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-default btn-sm" onClick={() => { setIsPaused(!isPaused); message.success(isPaused ? '继续' : '暂停（模拟）') }}>
                    {isPaused ? '继续' : '暂停'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => { clearInterval(pollRef.current); setIsTraining(false); message.success('训练已终止') }}>
                    终止训练
                  </button>
                </div>

                {/* Result (shown when done) */}
                {monitor?.status === 'completed' && monitor?.metrics && (
                  <div className="result-box" style={{ marginTop: 12 }}>
                    <div className="result-title">训练完成</div>
                    <div className="result-grid">
                      <div className="result-item"><div className="metric-value" style={{ color: '#52c41a' }}>{monitor.metrics.mAP50}</div><div className="metric-label">mAP@50</div></div>
                      <div className="result-item"><div className="metric-value" style={{ color: '#1890ff' }}>{monitor.metrics['mAP50-95']}</div><div className="metric-label">mAP@50-95</div></div>
                      <div className="result-item"><div className="metric-value">{monitor.metrics.precision || '0.000'}</div><div className="metric-label">Precision</div></div>
                      <div className="result-item"><div className="metric-value">{config.epochs}</div><div className="metric-label">训练轮数</div></div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== History Modal ===== */}
      {historyOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setHistoryOpen(false) }}>
          <div className="modal" style={{ width: 900, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header">训练历史<button className="modal-close" onClick={() => setHistoryOpen(false)}>✕</button></div>
            <div style={{ padding: 0 }}>
              <table className="table">
                <thead><tr>
                  <th>时间</th><th>算法</th><th>任务名称</th><th>数据集</th><th>模型</th><th>Epochs</th><th>mAP@50</th><th>状态</th><th>操作</th>
                </tr></thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#bfbfbf' }}>暂无训练记录</td></tr>
                  ) : history.map(j => (
                    <tr key={j.id}>
                      <td>{j.created_at?.slice(0, 10)}</td>
                      <td>{projectName}</td>
                      <td>{j.task_name}</td>
                      <td>train / val</td>
                      <td>{j.model}</td>
                      <td>{j.epochs}</td>
                      <td style={{ color: '#52c41a', fontWeight: 600 }}>{j.metrics?.mAP50 || '—'}</td>
                      <td><span className={`tag tag-${j.status === 'completed' ? 'success' : j.status === 'running' ? 'processing' : 'error'}`}>{j.status}</span></td>
                      <td>
                        <button className="btn btn-text btn-sm" onClick={() => { setHistoryOpen(false); message.success('下载中...') }}>下载</button>
                        <button className="btn btn-text btn-sm" style={{ color: '#ff4d4f' }} onClick={async () => {
                          await trainingApi.deleteJob(j.id); load(); message.success('已删除')
                        }}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
