import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { datasetApi } from '@/api/datasets'
import { labelApi } from '@/api/labels'
import { annotationApi } from '@/api/annotations'
import './Annotation.css'

function thumbSVG(idx) {
  const h = (idx * 37 + 180) % 360
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="hsl(${h+20},40%,75%)"/><rect y="22" width="64" height="18" fill="hsl(90,20%,60%)"/><rect x="10" y="10" width="14" height="14" rx="1" fill="hsl(${h},30%,65%)"/><text x="3" y="36" font-size="5" fill="#fff">${String(idx).padStart(4,'0')}</text></svg>`)}`
}

function sceneSVG() {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><defs><linearGradient id="s" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#87CEEB"/><stop offset="100%" style="stop-color:#E0E8F0"/></linearGradient></defs><rect width="900" height="600" fill="url(#s)"/><rect x="0" y="100" width="160" height="500" fill="#8899AA"/><rect x="740" y="80" width="160" height="520" fill="#99AABB"/><rect x="0" y="420" width="900" height="180" fill="#8B9A6E"/><rect x="0" y="430" width="900" height="60" fill="#555" opacity="0.4"/></svg>`)}`
}

const PRESET_COLORS = ['#ff4d4f','#1890ff','#52c41a','#faad14','#722ed1','#eb2f96','#13c2c2','#fa8c16','#a0d911','#2f54eb']
const AUTHORS = ['张三','李四','admin']
const TOTAL = 200

// ── Overview Mode ──
function OverviewMode({ projectId, onEnter }) {
  const [datasets, setDatasets] = useState([])
  const [selectedDs, setSelectedDs] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [images, setImages] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    datasetApi.listBatches(projectId).then(data => {
      const ds = []
      data.forEach(b => b.children.forEach(c => { if (c.stage === 'deduplicated') ds.push(c) }))
      setDatasets(ds)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [projectId])

  const onDsChange = (v) => {
    setSelectedDs(v)
    const ds = datasets.find(d => String(d.id) === v)
    if (!ds) return
    const total = parseInt((ds.size_label || '').match(/([\d,]+)/)?.[1]?.replace(/,/g,'') || TOTAL)
    const imgs = []
    for (let i = 1; i <= Math.min(total, TOTAL); i++) {
      const annotated = i <= Math.floor(total * 0.6)
      const unreviewed = i > Math.floor(total * 0.6) && i <= Math.floor(total * 0.6) + 30
      imgs.push({ id: `img_${String(i).padStart(5,'0')}`, idx: i, annotated, unreviewed, author: annotated ? AUTHORS[i%3] : '', notes: notes[`${v}_${i}`] || (annotated && i%7===0 ? '需复核':'') })
    }
    setImages(imgs)
  }

  let filtered = images
  if (statusFilter === 'annotated') filtered = images.filter(i => i.annotated)
  else if (statusFilter === 'unreviewed') filtered = images.filter(i => i.unreviewed)
  else if (statusFilter === 'unannotated') filtered = images.filter(i => !i.annotated && !i.unreviewed)

  return (
    <div className="anno-overview">
      <div className="page-header"><h2 style={{ fontSize: 18, fontWeight: 600 }}>数据标注总览</h2></div>
      <div className="anno-toolbar">
        <select value={selectedDs} onChange={e => onDsChange(e.target.value)} style={{ padding:'6px 10px',border:'1px solid #d9d9d9',borderRadius:4,fontSize:13,minWidth:280 }}>
          <option value="">— 选择数据集 —</option>
          {datasets.map(d => <option key={d.id} value={String(d.id)}>{d.batch_name} {d.stage_label} ({d.size_label})</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding:'6px 10px',border:'1px solid #d9d9d9',borderRadius:4,fontSize:13 }}>
          <option value="all">全部状态</option><option value="annotated">已标注</option><option value="unreviewed">未审查</option><option value="unannotated">未标注</option>
        </select>
        <span style={{ flex:1 }} />
      </div>
      {!selectedDs ? <div className="empty-state"><div>请选择一个数据集查看标注情况</div></div> : <>
        <div className="anno-stats">
          <div className="stat-card"><div className="stat-value">{images.length}</div><div className="stat-label">图片总数</div></div>
          <div className="stat-card"><div className="stat-value" style={{color:'#52c41a'}}>{images.filter(i=>i.annotated).length}</div><div className="stat-label">已标注</div></div>
          <div className="stat-card"><div className="stat-value" style={{color:'#eb2f96'}}>{images.filter(i=>i.unreviewed).length}</div><div className="stat-label">未审查</div></div>
          <div className="stat-card"><div className="stat-value" style={{color:'#faad14'}}>{images.filter(i=>!i.annotated&&!i.unreviewed).length}</div><div className="stat-label">未标注</div></div>
        </div>
        <div className="card" style={{flex:1,overflow:'auto'}}>
          <div className="card-body" style={{padding:0}}>
            <table className="anno-table"><thead><tr>
              <th style={{width:50}}>#</th><th>图片 ID</th><th style={{width:72}}>缩略图</th>
              <th style={{width:80}}>标注状态</th><th style={{width:72}}>作者</th><th>备注</th><th style={{width:80}}>操作</th>
            </tr></thead><tbody>
              {filtered.slice(0,50).map(img => <tr key={img.id}>
                <td>{img.idx}</td><td style={{fontFamily:'monospace',fontSize:11}}>{img.id}</td>
                <td><div className="ov-thumb"><img src={thumbSVG(img.idx)} alt="" /></div></td>
                <td>{img.annotated?<span className="tag tag-success">已标注</span>:img.unreviewed?<span className="tag" style={{background:'#fff0f6',color:'#eb2f96'}}>未审查</span>:<span className="tag tag-default">未标注</span>}</td>
                <td>{img.author||<span style={{color:'#bfbfbf'}}>—</span>}</td>
                <td><div className="ov-notes" contentEditable suppressContentEditableWarning onBlur={e=>setNotes(n=>({...n,[`${selectedDs}_${img.idx}`]:e.target.textContent}))}>{img.notes}</div></td>
                <td><button className="btn btn-primary btn-sm" onClick={()=>onEnter(selectedDs,img.idx)}>{img.annotated?'查看':'标注'}</button></td>
              </tr>)}
            </tbody></table>
          </div>
        </div>
      </>}
    </div>
  )
}

// ── Workspace Mode ──
function WorkspaceMode({ projectId, datasetId, initialIdx, onBack }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  // State for UI rendering (sidebar)
  const [labels, setLabels] = useState([
    {id:1,name:'police / 警察',color:'#ff4d4f'},{id:2,name:'security / 保安',color:'#1890ff'},
    {id:3,name:'worker / 工人',color:'#52c41a'},{id:4,name:'vehicle / 车辆',color:'#faad14'},{id:5,name:'helmet / 安全帽',color:'#722ed1'},
  ])
  const [activeLabel, setActiveLabel] = useState(1)
  const [tool, setTool] = useState('bbox')
  // regions stored in ref for FAST sync reads, plus a state copy for sidebar UI
  const regionsRef = useRef([])
  const [regionsForUI, setRegionsForUI] = useState([])
  const selectedRef = useRef(null)
  const [selectedForUI, setSelectedForUI] = useState(null)
  const [idx, setIdx] = useState(initialIdx || 1)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#ff4d4f')
  const [zoom, setZoom] = useState(1)
  const [px, setPx] = useState(0)
  const [py, setPy] = useState(0)
  const [regionCount, setRegionCount] = useState(0)
  const imgRef = useRef(null)
  const drawRef = useRef(false)
  const startRef = useRef({x:0,y:0})
  const dragRef = useRef(null)
  const panRef = useRef(null)

  // Helpers to keep ref + state in sync
  const setRegions = (val) => {
    const arr = typeof val === 'function' ? val(regionsRef.current) : val
    regionsRef.current = arr
    // Throttle UI updates — only sync state when useful (mouse up / selection change)
  }
  const syncUI = () => { setRegionsForUI([...regionsRef.current]); setRegionCount(regionsRef.current.length) }
  const selectRegion = (id) => { selectedRef.current = id; setSelectedForUI(id) }

  // Load labels
  useEffect(() => {
    labelApi.list(projectId).then(data => { if (data?.length) setLabels(data) }).catch(()=>{})
  }, [projectId])

  // Load annotations + preload background image
  useEffect(() => {
    const img = new Image()
    img.src = sceneSVG()
    img.onload = () => { imgRef.current = img; redraw() }
    annotationApi.get(Number(datasetId), idx).then(data => {
      const loaded = (data || []).map(a => ({ ...a, _id: a.id || Date.now() + Math.random() }))
      regionsRef.current = loaded
      syncUI()
      selectRegion(null)
      redraw()
    }).catch(() => { regionsRef.current = []; syncUI(); redraw() })
  }, [idx, datasetId])

  // Wheel zoom — imperative listener to allow preventDefault
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onWheel = (e) => { e.preventDefault(); const d = e.deltaY > 0 ? 0.9 : 1.1; setZoom(z => Math.min(5, Math.max(0.1, z * d))) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Imperative draw — no useEffect, no async image load
  const redraw = () => {
    const cvs = canvasRef.current
    if (!cvs) return
    cvs.width = 900
    cvs.height = 600
    const ctx = cvs.getContext('2d')
    ctx.clearRect(0, 0, 900, 600)
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, 900, 600)
    const regions = regionsRef.current
    const selId = selectedRef.current
    const lbls = labels
    regions.forEach(r => {
      const l = lbls.find(x => x.id === r.label_id) || lbls[0]
      if (l._hidden) return
      const sel = r._id === selId
      const pre = r.is_auto || (r.confidence != null && r.confidence < 1)
      ctx.save()
      ctx.strokeStyle = l.color; ctx.lineWidth = sel ? 3 : 2
      if (pre) { ctx.setLineDash([6,4]); ctx.globalAlpha = 0.7 }
      ctx.fillStyle = l.color + '1A'
      ctx.fillRect(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h)
      ctx.strokeRect(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h)
      if (sel) {
        ctx.setLineDash([]); ctx.globalAlpha=1; ctx.lineWidth=1.5
        ;[[r.bbox_x,r.bbox_y],[r.bbox_x+r.bbox_w,r.bbox_y],[r.bbox_x,r.bbox_y+r.bbox_h],[r.bbox_x+r.bbox_w,r.bbox_y+r.bbox_h]].forEach(([hx,hy]) => {ctx.fillStyle='#fff';ctx.fillRect(hx-4,hy-4,8,8);ctx.strokeStyle=l.color;ctx.strokeRect(hx-4,hy-4,8,8)})
      }
      const name = (l.name||'').split('/')[0].trim()
      ctx.setLineDash([]); ctx.globalAlpha=0.9; ctx.font='bold 11px sans-serif'
      const tw = ctx.measureText(name).width + 14
      const by = r.bbox_y - 20 >= 0 ? r.bbox_y - 20 : r.bbox_y + 2
      ctx.fillStyle = l.color; ctx.fillRect(r.bbox_x, by, tw, 18)
      ctx.fillStyle = '#fff'; ctx.fillText(name, r.bbox_x+7, by+13)
      if (pre && r.confidence != null) {
        const cs = Math.round(r.confidence*100)+'%'
        const cw = ctx.measureText(cs).width+10
        ctx.fillStyle = r.confidence>=0.7?'#52c41a':r.confidence>=0.5?'#faad14':'#ff4d4f'
        ctx.fillRect(r.bbox_x+tw+4, by, cw, 18)
        ctx.fillStyle='#fff'; ctx.fillText(cs, r.bbox_x+tw+9, by+13)
      }
      ctx.restore()
    })
  }

  const toImg = (cx, cy) => {
    const wr = wrapperRef.current?.getBoundingClientRect()
    if (!wr) return {x:0,y:0}
    const vx = wr.width/2 - (900 * zoom)/2 + px
    const vy = wr.height/2 - (600 * zoom)/2 + py
    return { x: (cx - wr.left - vx) / zoom, y: (cy - wr.top - vy) / zoom }
  }

  const hit = (px, py) => {
    const rs = regionsRef.current
    for (let i = rs.length-1; i>=0; i--) {
      const r = rs[i]
      if (px >= r.bbox_x && px <= r.bbox_x+r.bbox_w && py >= r.bbox_y && py <= r.bbox_y+r.bbox_h) return r._id
    }
    return null
  }

  const onMDown = (e) => {
    if (e.button !== 0) return
    const p = toImg(e.clientX, e.clientY)
    if (tool === 'pan') { panRef.current = {x:e.clientX,y:e.clientY,px,py}; return }
    if (tool === 'select') {
      const h = hit(p.x, p.y)
      selectRegion(h)
      if (h) {
        const r = regionsRef.current.find(r => r._id === h)
        if (r) dragRef.current = { id: h, sx: p.x, sy: p.y, ox: r.bbox_x, oy: r.bbox_y }
      }
      redraw()
      return
    }
    if (tool === 'bbox') {
      drawRef.current = true; startRef.current = p
      const nr = {_id: Date.now(), label_id: activeLabel, bbox_x: p.x, bbox_y: p.y, bbox_w: 0, bbox_h: 0, confidence: null, is_auto: false}
      regionsRef.current = [...regionsRef.current, nr]
      selectRegion(nr._id)
      redraw()
    }
  }

  const onMMove = (e) => {
    const p = toImg(e.clientX, e.clientY)
    if (panRef.current) { setPx(panRef.current.px + (e.clientX - panRef.current.x)); setPy(panRef.current.py + (e.clientY - panRef.current.y)); return }
    if (dragRef.current) {
      const d = dragRef.current, dx = p.x-d.sx, dy = p.y-d.sy
      regionsRef.current = regionsRef.current.map(r => r._id === d.id ? {...r, bbox_x: d.ox+dx, bbox_y: d.oy+dy} : r)
      redraw()
      return
    }
    if (drawRef.current) {
      const a = startRef.current, sid = selectedRef.current
      regionsRef.current = regionsRef.current.map(r => r._id === sid ? {...r, bbox_x: Math.min(a.x,p.x), bbox_y: Math.min(a.y,p.y), bbox_w: Math.abs(p.x-a.x), bbox_h: Math.abs(p.y-a.y)} : r)
      redraw()
    }
  }

  const onMUp = () => {
    if (dragRef.current || drawRef.current) {
      if (drawRef.current) {
        drawRef.current = false; const sid = selectedRef.current
        regionsRef.current = regionsRef.current.filter(r => !(r._id === sid && r.bbox_w < 3 && r.bbox_h < 3))
        if (!regionsRef.current.find(r => r._id === sid)) selectRegion(null)
        redraw()
      }
      syncUI()
    }
    panRef.current = null; dragRef.current = null
  }

  const zoomIn = () => setZoom(z => Math.min(5, z*1.2))
  const zoomOut = () => setZoom(z => Math.max(0.1, z/1.2))
  const fitWin = () => { setZoom(1); setPx(0); setPy(0) }

  const save = () => {
    const annos = regionsRef.current.map(r => ({ id: typeof r.id === 'number' && r.id < 1000000 ? r.id : null, label_id: r.label_id, bbox_x: r.bbox_x, bbox_y: r.bbox_y, bbox_w: r.bbox_w, bbox_h: r.bbox_h, confidence: r.confidence, is_auto: r.is_auto || false }))
    annotationApi.save(Number(datasetId), idx, annos).catch(()=>{})
  }

  const goPrev = () => { if (idx>1) { save(); setIdx(i=>i-1) } }
  const goNext = () => { save(); setIdx(i=>i+1) }
  const submit = () => { save(); message.success('标注已提交，跳转下一张'); setIdx(i=>i+1) }

  const addLabel = () => {
    const n = newName.trim(); if (!n) return
    const nl = { id: labels.length+10, name: n, color: newColor }
    labelApi.create(projectId, { name: n, color: newColor }).catch(()=>{})
    setLabels(l=>[...l, nl]); setAddOpen(false); setNewName('')
  }

  const updateSelected = (field, val) => {
    const sid = selectedRef.current
    regionsRef.current = regionsRef.current.map(r => r._id === sid ? {...r, [field]: val} : r)
    syncUI(); redraw()
  }

  const selected = regionsRef.current.find(r => r._id === selectedForUI)
  const isPre = selected && (selected.is_auto || (selected.confidence != null && selected.confidence < 1))
  const regionsForDisplay = regionsForUI

  return (
    <div className="anno-workspace">
      <div className="anno-info-bar">
        <div className="info-card"><div className="info-dot green" /><div><div className="info-value">标注中</div></div></div>
        <div className="info-card"><span>算法</span><strong>{localStorage.getItem('current_project_name')||'—'}</strong></div>
        <div className="info-card"><span>标签类别</span><strong>{labels.length} 类</strong></div>
        <div className="info-card"><span>已标注</span><strong style={{color:'#1890ff'}}>{idx} / {TOTAL}</strong></div>
        <div className="info-card"><span>本图标注框</span><strong>{regionCount}</strong></div>
        <div className="info-actions">
          <button className="btn btn-default btn-sm" onClick={onBack}>返回总览</button>
          <button className="btn btn-default btn-sm" onClick={save}>保存草稿</button>
        </div>
      </div>

      <div className="anno-main">
        <div className="canvas-panel">
          <div className="canvas-toolbar">
            <button className={`tool-btn${tool==='select'?' active':''}`} onClick={()=>setTool('select')}>选择</button>
            <button className={`tool-btn${tool==='bbox'?' active':''}`} onClick={()=>setTool('bbox')}>画框</button>
            <button className={`tool-btn${tool==='pan'?' active':''}`} onClick={()=>setTool('pan')}>平移</button>
            <span className="tb-sep" />
            <button className="tool-btn" onClick={()=>{regionsRef.current=regionsRef.current.slice(0,-1);selectRegion(null);syncUI();redraw()}}>撤销</button>
            <button className="tool-btn" onClick={()=>{regionsRef.current=regionsRef.current.filter(r=>r._id!==selectedRef.current);selectRegion(null);syncUI();redraw()}}>删除</button>
            <span className="tb-sep" />
            <button className="tool-btn" onClick={zoomOut}>−</button>
            <span style={{fontSize:12,fontWeight:500,minWidth:42,textAlign:'center'}}>{Math.round(zoom*100)}%</span>
            <button className="tool-btn" onClick={zoomIn}>+</button>
            <button className="tool-btn" onClick={fitWin}>适应</button>
          </div>
          <div ref={wrapperRef} className="canvas-wrapper" onMouseDown={onMDown} onMouseMove={onMMove} onMouseUp={onMUp} onMouseLeave={onMUp}
            >
            <canvas ref={canvasRef} style={{position:'absolute',top:'50%',left:'50%',
              transform:`translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) scale(${zoom})`}} />
          </div>
          <div className="canvas-footer">
            <button className="btn btn-default btn-sm" onClick={goPrev} disabled={idx<=1}>◀ 上一张</button>
            <span className="nav-counter">当前：<strong>{idx}</strong> / {TOTAL}</span>
            <button className="btn btn-default btn-sm" onClick={goNext}>下一张 ▶</button>
            <button className="btn btn-primary btn-sm" onClick={submit}>提交 ▶</button>
          </div>
        </div>

        <div className="side-panel">
          <div className="panel-card labels-card">
            <div className="panel-card-header">标签列表<button className="btn btn-text btn-sm" style={{marginLeft:'auto'}} onClick={()=>setAddOpen(true)}>+ 添加</button></div>
            <div className="label-list">
              {labels.map(l => <div key={l.id} className={`label-item${activeLabel===l.id?' active':''}`}
                onClick={() => { setActiveLabel(l.id); if (selectedRef.current) { regionsRef.current = regionsRef.current.map(r => r._id === selectedRef.current ? {...r, label_id: l.id} : r); syncUI(); redraw() } }}>
                <span className="label-color" style={{background:l.color}} /><span>{l.name}</span>
                <span style={{flex:1}} /><span className="label-shortcut">{l.id < 10 ? l.id : ''}</span>
                <button className="label-del" onClick={e=>{e.stopPropagation();setLabels(ls=>ls.filter(x=>x.id!==l.id))}}>✕</button>
              </div>)}
            </div>
          </div>
          <div className="panel-card regions-card">
            <div className="panel-card-header">标注列表<span className="count">{regionCount} 个标注框</span></div>
            <div className="region-list">
              {regionsForDisplay.length===0
                ? <div style={{padding:24,fontSize:12,color:'#bfbfbf',textAlign:'center'}}>暂无标注框<br /><span style={{fontSize:11}}>选择标签后，在画布上拖拽绘制</span></div>
                : regionsForDisplay.map((r,i) => { const l=labels.find(x=>x.id===r.label_id)||labels[0]; const pre=r.is_auto||(r.confidence!=null&&r.confidence<1)
                  return <div key={r._id} className={`region-item${r._id===selectedForUI?' selected':''}`} onClick={()=>{selectRegion(r._id);redraw()}}>
                    <span style={{width:10,height:10,borderRadius:2,background:l.color,flexShrink:0}} /><span className="region-idx">#{i+1}</span>
                    <span className="region-label">{(l.name||'').split('/')[0].trim()}</span>
                    {pre?<span className="region-conf">{Math.round((r.confidence||0.5)*100)}%</span>:<span style={{fontSize:9,color:'#52c41a'}}>人工</span>}
                    <button className="region-del" onClick={e=>{e.stopPropagation();regionsRef.current=regionsRef.current.filter(x=>x._id!==r._id);selectRegion(null);syncUI();redraw()}}>🗑</button>
                  </div>
                })
              }
            </div>
          </div>
          <div className="panel-card detail-card">
            <div className="panel-card-header">详情面板</div>
            <div className="detail-content">
              {selected ? <>
                <div className="detail-row"><span className="dl">标签</span><select value={selected.label_id} onChange={e => updateSelected('label_id', Number(e.target.value))}>{labels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div className="detail-row"><span className="dl">X</span><input type="number" value={Math.round(selected.bbox_x)} onChange={e => updateSelected('bbox_x', parseFloat(e.target.value)||0)} /></div>
                <div className="detail-row"><span className="dl">Y</span><input type="number" value={Math.round(selected.bbox_y)} onChange={e => updateSelected('bbox_y', parseFloat(e.target.value)||0)} /></div>
                <div className="detail-row"><span className="dl">宽度</span><input type="number" value={Math.round(selected.bbox_w)} onChange={e => updateSelected('bbox_w', parseFloat(e.target.value)||0)} /></div>
                <div className="detail-row"><span className="dl">高度</span><input type="number" value={Math.round(selected.bbox_h)} onChange={e => updateSelected('bbox_h', parseFloat(e.target.value)||0)} /></div>
                {isPre && <div className="detail-row"><span className="dl">置信度</span><span style={{color:selected.confidence>=0.7?'#52c41a':selected.confidence>=0.5?'#faad14':'#ff4d4f'}}>{Math.round((selected.confidence||0)*100)}% (预标注)</span></div>}
                <div className="detail-row"><span className="dl">来源</span><span>{isPre?'模型预标注':'人工标注'}</span></div>
              </> : <div className="detail-empty">点击标注框查看详细属性</div>}
            </div>
          </div>
        </div>
      </div>

      {addOpen && <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setAddOpen(false)}}>
        <div className="modal" style={{width:360}}>
          <div className="modal-header">新建标签<button className="modal-close" onClick={()=>setAddOpen(false)}>✕</button></div>
          <div style={{padding:20}}>
            <div style={{marginBottom:14}}><label style={{display:'block',marginBottom:4,fontSize:12,color:'#8c8c8c'}}>标签名称</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="如：police / 警察"
                style={{width:'100%',padding:'6px 10px',border:'1px solid #d9d9d9',borderRadius:4,fontSize:13,fontFamily:'inherit'}}
                onKeyDown={e=>e.key==='Enter'&&addLabel()} autoFocus /></div>
            <div><label style={{display:'block',marginBottom:4,fontSize:12,color:'#8c8c8c'}}>标签颜色</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{PRESET_COLORS.map(c=><div key={c} onClick={()=>setNewColor(c)}
                style={{width:28,height:28,borderRadius:4,background:c,cursor:'pointer',border:newColor===c?'2px solid #262626':'2px solid transparent'}} />)}</div>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-default btn-sm" onClick={()=>setAddOpen(false)}>取消</button><button className="btn btn-primary btn-sm" onClick={addLabel}>确定</button></div>
        </div>
      </div>}
    </div>
  )
}

// ── Main ──
export default function Annotation() {
  const [mode, setMode] = useState('overview')
  const [entry, setEntry] = useState({ ds: null, idx: 1 })
  const projectId = Number(localStorage.getItem('current_project') || 0)
  const [sp] = useSearchParams()

  useEffect(() => {
    const ds = sp.get('dataset')
    if (ds) { setEntry({ ds, idx: 1 }); setMode('workspace') }
  }, [])

  if (!projectId) return <div className="empty-state"><div style={{fontSize:14}}>请先选择一个算法</div></div>

  return mode === 'overview'
    ? <OverviewMode projectId={projectId} onEnter={(ds,idx)=>{setEntry({ds,idx});setMode('workspace')}} />
    : <WorkspaceMode projectId={projectId} datasetId={entry.ds} initialIdx={entry.idx} onBack={()=>setMode('overview')} />
}
