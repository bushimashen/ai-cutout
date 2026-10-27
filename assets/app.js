/* 页面逻辑：主体类型 → 推荐模型 → 本地推理 → 结果预览 / 导出 */
import { CATEGORIES, MODELS, NETDISK, SUBJECT_TYPES, categoryOf, modelById } from './models.js'
import { clearCache, compose, currentModelId, deviceLabel, ensureModel, isCached, matte } from './matting.js'

const $ = (id) => document.getElementById(id)

const state = {
  bmp: null,
  name: '',
  subject: 'chibi3d',
  modelId: (SUBJECT_TYPES.find((t) => t.key === 'chibi3d') || {}).recommend || 'rmbg14',
  result: null,        // { alpha, w, h }
  lastOut: null,       // 当前合成后的 canvas
  view: 'result',
  busy: false,
  status: {}           // modelId -> 'cached' | 'ready'
}

/* ---------------- 通用 UI ---------------- */
let toastTimer = null
function toast(msg, isErr) {
  const el = $('toast')
  el.textContent = msg
  el.hidden = false
  el.classList.toggle('err', !!isErr)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, 4200)
}
function overlay(on, title, pct, sub) {
  const ov = $('overlay')
  ov.hidden = !on
  if (on) {
    $('ovTitle').textContent = title || '处理中…'
    $('ovBar').style.width = (pct || 0) + '%'
    $('ovSub').textContent = sub || ''
  }
}
function setProgress(pct, text) {
  $('ovBar').style.width = Math.max(1, Math.min(100, pct || 0)) + '%'
  if (text) $('ovSub').textContent = text
}

/* ---------------- 主体类型 ---------------- */
function renderTypes() {
  const box = $('types')
  box.innerHTML = ''
  SUBJECT_TYPES.forEach((t) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'type' + (t.key === state.subject ? ' on' : '')
    const model = modelById(t.recommend)
    b.innerHTML =
      '<span class="t-name">' + t.label + '</span>' +
      '<span class="t-model">推荐：' + (model ? model.name : '—') + (model ? ' · ' + model.sizeMB + 'MB' : '') + '</span>'
    b.onclick = () => {
      state.subject = t.key
      state.modelId = t.recommend
      renderTypes()
      renderModels()
      $('typeHint').textContent = t.note
      syncRun()
    }
    box.appendChild(b)
  })
  const cur = SUBJECT_TYPES.find((t) => t.key === state.subject)
  $('typeHint').textContent = cur ? cur.note : ''
}

/* ---------------- 模型列表 ---------------- */
function modelsForSubject() {
  const t = SUBJECT_TYPES.find((x) => x.key === state.subject)
  if (!t) return []
  return [t.recommend, ...(t.alt || [])].map(modelById).filter(Boolean)
}
async function renderModels() {
  const box = $('models')
  const list = modelsForSubject()
  box.innerHTML = ''
  for (const m of list) {
    const cached = await isCached(m.id)
    if (cached) state.status[m.id] = state.status[m.id] || 'cached'
    const cat = categoryOf(m.id)
    const el = document.createElement('label')
    el.className = 'model' + (m.id === state.modelId ? ' on' : '')
    const badge =
      state.status[m.id] === 'ready' ? '<i class="tag ok">已就绪</i>'
        : cached ? '<i class="tag">已缓存</i>'
          : m.url ? '<i class="tag warn">需下载 ' + m.sizeMB + 'MB</i>'
            : '<i class="tag warn">仅手动上传</i>'
    el.innerHTML =
      '<input type="radio" name="model" value="' + m.id + '"' + (m.id === state.modelId ? ' checked' : '') + '>' +
      '<span class="m-main">' +
        '<span class="m-name">' + m.name + badge + '</span>' +
        '<span class="m-sub">' + (cat ? cat.dir + ' · ' : '') + m.sizeMB + 'MB · ' + m.speed + '</span>' +
        '<span class="m-good">' + m.good + '</span>' +
      '</span>'
    el.querySelector('input').onchange = () => {
      state.modelId = m.id
      renderModels()
      syncRun()
    }
    box.appendChild(el)
  }
  $('btnDownload').hidden = !(modelById(state.modelId) && modelById(state.modelId).url)
}

/* ---------------- 图片 ---------------- */
const MAX_SIDE = 2048
async function ingest(blob, filename) {
  if (!blob || !blob.type.startsWith('image/')) { toast('请选择图片文件', true); return }
  try {
    let bmp = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale < 1) {
      const cv = document.createElement('canvas')
      cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale)
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height)
      bmp.close()
      bmp = await createImageBitmap(cv)
    }
    state.bmp = bmp
    state.name = (filename || 'image').replace(/\.[^.]+$/, '')
    state.result = null
    state.lastOut = null
    $('dropzone').hidden = true
    $('stage').hidden = false
    $('stageTools').hidden = false
    $('tabs').hidden = false
    $('stageFoot').hidden = false
    state.view = 'origin'
    document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.view === 'origin'))
    $('imgMeta').textContent = bmp.width + '×' + bmp.height + ' · ' + state.name
    $('runMeta').textContent = ''
    $('exportRow').hidden = true
    $('stageHint').hidden = false
    drawView()
    syncRun()
  } catch (e) {
    toast('图片读取失败：' + e.message, true)
  }
}
function resetImage() {
  state.bmp = null
  state.result = null
  state.lastOut = null
  $('dropzone').hidden = false
  $('stage').hidden = true
  $('stageTools').hidden = true
  $('tabs').hidden = true
  $('stageFoot').hidden = true
  $('exportRow').hidden = true
  $('fileInput').value = ''
  syncRun()
}

/* ---------------- 绘制预览 ---------------- */
function drawView() {
  if (!state.bmp) return
  const cv = $('view')
  const box = $('stage').getBoundingClientRect()
  const maxW = Math.max(120, box.width - 2)
  const maxH = Math.max(120, Math.max(320, window.innerHeight * 0.5))
  const s = Math.min(maxW / state.bmp.width, maxH / state.bmp.height, 1)
  cv.width = Math.round(state.bmp.width * s)
  cv.height = Math.round(state.bmp.height * s)
  const c = cv.getContext('2d')
  c.clearRect(0, 0, cv.width, cv.height)
  if ($('chkChecker').checked) {
    const size = 14
    for (let y = 0; y < cv.height; y += size) {
      for (let x = 0; x < cv.width; x += size) {
        c.fillStyle = (((x / size) | 0) + ((y / size) | 0)) % 2 ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.02)'
        c.fillRect(x, y, size, size)
      }
    }
  }
  const src = state.view === 'result' && state.lastOut ? state.lastOut : state.bmp
  c.drawImage(src, 0, 0, cv.width, cv.height)
}

function recompose() {
  if (!state.result) return
  const opts = {
    feather: Number($('feather').value),
    cutoff: Number($('cut').value),
    bg: $('selBg').value,
    color: $('bgColor').value
  }
  state.lastOut = compose(state.bmp, state.result.alpha, opts)
  if (state.view === 'origin' && state.result) {
    state.view = 'result'
    document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.view === 'result'))
  }
  $('stageHint').hidden = true
  drawView()
}

/* ---------------- 抠图主流程 ---------------- */
function syncRun() {
  const ok = !!state.bmp && !state.busy
  $('btnRun').disabled = !ok
  const m = modelById(state.modelId)
  $('runHint').textContent = !state.bmp
    ? '先上传图片，再选主体类型。'
    : !m.url && state.status[m.id] !== 'ready' && !state.result
      ? '该模型没有在线直链，需要网盘下载后「手动上传 .onnx」。'
      : '首次使用会下载模型（约 ' + m.sizeMB + 'MB），之后走本机缓存。'
}
async function run() {
  if (!state.bmp || state.busy) return
  state.busy = true
  const m = modelById(state.modelId)
  overlay(true, '准备模型…', 2, m.name)
  const t0 = performance.now()
  try {
    await ensureModel(state.modelId, (pct, text) => {
      state.progress = pct + '% ' + text
      overlay(true, pct < 90 ? '下载模型中…' : '初始化推理会话…', pct, text)
    })
    state.status[state.modelId] = 'ready'
    overlay(true, 'AI 识别主体…', 92, '这一步在你的浏览器里跑，取决于电脑性能')
    const res = await matte(state.bmp, state.modelId, (stage) => setProgress(96, stage))
    state.result = res
    recompose()
    const sec = ((performance.now() - t0) / 1000).toFixed(1)
    $('runMeta').textContent = m.name + ' · ' + deviceLabel() + ' · ' + sec + 's'
    $('exportRow').hidden = false
    $('footDevice').textContent = '当前推理后端：' + deviceLabel() + ' · 模型：' + m.name
    renderModels()
    toast('抠图完成，' + (res.bbox ? '识别到主体' : '没识别到明显主体，可换个模型试试'))
  } catch (e) {
    toast(e.message || String(e), true)
  } finally {
    overlay(false)
    state.busy = false
    syncRun()
  }
}

/* ---------------- 导出 ---------------- */
function download(canvas, filename, type, quality) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }, type, quality)
}
function outputCanvas(kind) {
  if (!state.result) return null
  const opts = { feather: Number($('feather').value), cutoff: Number($('cut').value) }
  if (kind === 'png') return compose(state.bmp, state.result.alpha, Object.assign({ bg: 'alpha' }, opts))
  if (kind === 'jpg') return compose(state.bmp, state.result.alpha, Object.assign({ bg: 'white' }, opts))
  return compose(state.bmp, state.result.alpha, Object.assign({ bg: 'mask' }, opts))
}

/* ---------------- 模型对照表 / 网盘 ---------------- */
function renderTable() {
  const tb = $('mtable').querySelector('tbody')
  tb.innerHTML = ''
  MODELS.forEach((m) => {
    const cat = categoryOf(m.id)
    const tr = document.createElement('tr')
    tr.innerHTML =
      '<td><b>' + m.name + '</b><br><span class="muted">' + m.license + '</span></td>' +
      '<td>' + (cat ? cat.dir : '—') + '</td>' +
      '<td>' + m.sizeMB + 'MB</td>' +
      '<td>' + m.good + '</td>' +
      '<td class="bad">' + m.bad + '</td>' +
      '<td>' + (m.url ? new URL(m.url).host : '<b>网盘 / 手动上传</b>') + '</td>' +
      '<td>' + m.speed + '</td>'
    tb.appendChild(tr)
  })
}
function renderNetdisk() {
  $('netdiskTip').textContent = NETDISK.tip
  const box = $('netdisk')
  box.innerHTML = ''
  NETDISK.links.forEach((l) => {
    const row = document.createElement('div')
    row.className = 'nd'
    const cat = categoryOf(l.id)
    row.innerHTML =
      '<span class="nd-label">' + l.label + (cat ? ' <span class="muted">→ 放到「模型/' + cat.dir + '」</span>' : '') + '</span>' +
      (l.value
        ? '<a class="nd-link" href="' + l.value + '" target="_blank" rel="noopener">去下载</a>'
        : '<span class="nd-link off" title="在 assets/models.js 的 NETDISK.links 里填入分享链接即可自动生效">链接待补充</span>')
    box.appendChild(row)
  })
}

/* ---------------- 事件绑定 ---------------- */
function bind() {
  $('btnPick').onclick = () => $('fileInput').click()
  $('fileInput').onchange = (e) => {
    const f = e.target.files[0]
    if (f) ingest(f, f.name)
    e.target.value = ''
  }
  const dz = $('dropzone')
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag') })
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'))
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag')
    const f = e.dataTransfer.files[0]
    if (f) ingest(f, f.name)
  })
  document.addEventListener('paste', (e) => {
    if (state.bmp) return
    const items = e.clipboardData && e.clipboardData.items
    if (!items) return
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) { ingest(f, '剪贴板图片'); break }
      }
    }
  })
  $('btnSample').onclick = () => {
    fetch('samples/示例-碎星岩.jpg')
      .then((r) => r.blob())
      .then((b) => ingest(b, '碎星岩'))
      .catch(() => toast('示例图加载失败', true))
  }
  $('btnReset').onclick = resetImage
  $('btnRun').onclick = run

  document.querySelectorAll('#tabs .tab').forEach((b) => {
    b.onclick = () => {
      state.view = b.dataset.view
      document.querySelectorAll('#tabs .tab').forEach((x) => x.classList.toggle('on', x === b))
      drawView()
    }
  })
  $('chkChecker').onchange = drawView
  window.addEventListener('resize', drawView)

  $('btnDownload').onclick = async () => {
    if (state.busy) return
    state.busy = true
    overlay(true, '下载模型中…', 1, '')
    try {
      await ensureModel(state.modelId, (pct, text) => setProgress(pct, text))
      state.status[state.modelId] = 'ready'
      toast('模型已就绪')
    } catch (e) {
      toast(e.message || String(e), true)
    } finally {
      overlay(false); state.busy = false; renderModels(); syncRun()
    }
  }
  $('btnUpload').onclick = () => $('modelInput').click()
  $('modelInput').onchange = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (!/\.onnx$/i.test(f.name)) { toast('请选择 .onnx 模型文件', true); return }
    state.busy = true
    overlay(true, '读取模型文件…', 30, f.name)
    try {
      const buf = await f.arrayBuffer()
      await ensureModel(state.modelId, (pct, text) => setProgress(pct, text), buf)
      state.status[state.modelId] = 'ready'
      toast('模型已加载并缓存到本机')
    } catch (err) {
      toast('模型加载失败：' + (err.message || err), true)
    } finally {
      overlay(false); state.busy = false; renderModels(); syncRun()
    }
  }
  $('btnClear').onclick = async () => {
    await clearCache(state.modelId)
    delete state.status[state.modelId]
    toast('已清除该模型的本机缓存')
    renderModels(); syncRun()
  }

  $('selBg').onchange = (e) => {
    $('bgColorField').hidden = e.target.value !== 'color'
    recompose()
  }
  $('bgColor').oninput = recompose
  $('feather').oninput = (e) => { $('vFeather').textContent = e.target.value + ' px'; recompose() }
  $('cut').oninput = (e) => { $('vCut').textContent = e.target.value; recompose() }

  $('btnSavePng').onclick = () => { const c = outputCanvas('png'); if (c) download(c, state.name + '-抠图.png', 'image/png') }
  $('btnSaveJpg').onclick = () => { const c = outputCanvas('jpg'); if (c) download(c, state.name + '-白底.jpg', 'image/jpeg', 0.95) }
  $('btnSaveMask').onclick = () => { const c = outputCanvas('mask'); if (c) download(c, state.name + '-蒙版.png', 'image/png') }
}

/* ---------------- 启动 ---------------- */
renderTypes()
renderModels()
renderTable()
renderNetdisk()
bind()
syncRun()

// 调试/自动化测试用的钩子
window.__cut = {
  state,
  run,
  ingest,
  models: MODELS,
  categories: CATEGORIES,
  ready() { return !!state.result },
  current: currentModelId,
  snapshot() {
    return {
      busy: state.busy,
      modelId: state.modelId,
      progress: state.progress || '',
      ready: !!state.result,
      session: currentModelId(),
      hasBmp: !!state.bmp,
      toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent
    }
  }
}
