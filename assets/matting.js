/* ============================================================
   抠图引擎：onnxruntime-web（WASM / WebGPU）+ 模型下载缓存 + 多模型预处理
   所有推理都在用户浏览器里跑，图片和模型都不经过站点服务器。
   ============================================================ */
import { modelById } from './models.js'

// wasmPaths 必须是绝对 URL：给相对目录时 ort 解析不出正确路径，会报 initWasm() failed
const ORT_BASE = new URL('runtime/onnxruntime/', document.baseURI).href
const ORT_SCRIPT = ORT_BASE + 'ort.webgpu.min.js'
const DB_NAME = 'ai-cutout'
const DB_STORE = 'models'
const CACHE_VERSION = 1

let ort = null
let session = null
let sessionId = null
let device = ''
let loading = null

/* ---------------- 运行时 ---------------- */
export function loadRuntime() {
  if (ort) return Promise.resolve(ort)
  if (window.ort && window.ort.InferenceSession) {
    ort = window.ort
    return Promise.resolve(ort)
  }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = ORT_SCRIPT
    s.async = true
    s.onload = () => {
      if (!window.ort || !window.ort.InferenceSession) {
        rej(new Error('推理运行时初始化失败（' + ORT_SCRIPT + '）'))
        return
      }
      ort = window.ort
      try {
        ort.env.wasm.numThreads = 1 // 站点未开启 COOP/COEP，拿不到 SharedArrayBuffer
        ort.env.wasm.simd = true
        ort.env.wasm.wasmPaths = ORT_BASE
      } catch (e) {}
      res(ort)
    }
    s.onerror = () => rej(new Error('推理运行时加载失败，请确认 runtime/onnxruntime 目录完整'))
    document.head.appendChild(s)
  })
}

export const deviceLabel = () => device || ''
export const currentModelId = () => sessionId || ''

/* ---------------- 模型缓存（IndexedDB） ---------------- */
function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function idbGet(key) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const r = tx.objectStore(DB_STORE).get(key)
    r.onsuccess = () => res(r.result || null)
    r.onerror = () => rej(r.error)
  })
}
async function idbPut(key, buf) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(buf, key)
    tx.oncomplete = () => res(true)
    tx.onerror = () => rej(tx.error)
  })
}
async function idbDel(key) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(key)
    tx.oncomplete = () => res(true)
    tx.onerror = () => rej(tx.error)
  })
}
const cacheKey = (m) => m.id + '@' + m.file + '#v' + CACHE_VERSION

/** 该模型是否已缓存在本机浏览器 */
export async function isCached(id) {
  const m = modelById(id)
  if (!m) return false
  try {
    const rec = await idbGet(cacheKey(m))
    return !!(rec && rec.data)
  } catch (e) {
    return false
  }
}
export async function clearCache(id) {
  const m = modelById(id)
  if (!m) return
  await idbDel(cacheKey(m))
  if (sessionId === id) releaseSession()
}

/* ---------------- 取模型字节：缓存 → 直链下载 ---------------- */
/**
 * @param id 模型 id
 * @param onProgress (pct 0-100, text)
 * @returns ArrayBuffer
 */
async function fetchModelBytes(id, onProgress) {
  const m = modelById(id)
  if (!m) throw new Error('未知模型：' + id)

  const cached = await idbGet(cacheKey(m))
  if (cached && cached.data) {
    onProgress && onProgress(100, '已命中本机缓存')
    return cached.data
  }

  const urls = [m.url, m.mirror].filter(Boolean)
  if (!urls.length) {
    throw new Error('该模型没有可用的在线直链，请到网盘下载后点「手动上传模型」')
  }

  let lastErr = null
  for (const url of urls) {
    try {
      onProgress && onProgress(2, '连接下载源…')
      const resp = await fetch(url, { mode: 'cors' })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const total = Number(resp.headers.get('content-length') || 0)
      let buf
      if (resp.body && resp.body.getReader && total) {
        // 流式读取，边下边报进度
        const reader = resp.body.getReader()
        const chunks = []
        let got = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          got += value.length
          onProgress && onProgress(
            Math.min(96, (got / total) * 96),
            (got / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB'
          )
        }
        buf = new Uint8Array(got)
        let off = 0
        for (const c of chunks) { buf.set(c, off); off += c.length }
        buf = buf.buffer
      } else {
        onProgress && onProgress(30, '下载中（源站未返回文件大小）…')
        buf = await resp.arrayBuffer()
        onProgress && onProgress(96, (buf.byteLength / 1048576).toFixed(1) + ' MB')
      }
      onProgress && onProgress(97, '存入本机缓存…')
      try { await idbPut(cacheKey(m), buf) } catch (e) {}
      return buf
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error('模型下载失败：' + (lastErr && lastErr.message || '网络不可达'))
}

/* ---------------- 会话 ---------------- */
async function createSession(buf, m) {
  const eps = []
  try { if (navigator.gpu) eps.push('webgpu') } catch (e) {}
  eps.push('wasm')
  try {
    const s = await ort.InferenceSession.create(buf, { executionProviders: eps })
    device = eps[0] === 'webgpu' ? 'WebGPU' : 'WASM'
    return s
  } catch (e) {
    const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] })
    device = 'WASM'
    return s
  }
}
export function releaseSession() {
  try { session && session.release && session.release() } catch (e) {}
  session = null
  sessionId = null
}

/** 确保指定模型已就绪（缓存/下载/手动文件三选一） */
export async function ensureModel(id, onProgress, fileBuf) {
  const m = modelById(id)
  if (!m) throw new Error('未知模型：' + id)
  if (session && sessionId === id && !fileBuf) return session
  if (loading) return loading
  loading = (async () => {
    await loadRuntime()
    if (session && sessionId !== id) releaseSession()
    let buf = fileBuf
    if (!buf) buf = await fetchModelBytes(id, onProgress)
    onProgress && onProgress(98, '初始化推理会话…')
    if (session && sessionId === id) releaseSession()
    session = await createSession(buf, m)
    sessionId = id
    try { await idbPut(cacheKey(m), buf) } catch (e) {}
    return session
  })()
  try { return await loading } finally { loading = null }
}

/* ---------------- 预处理 ---------------- */
function layoutInput(bmp, layout) {
  const bw = bmp.width, bh = bmp.height
  const t = layout.target
  let w, h, padX = 0, padY = 0, netW, netH

  if (layout.mode === 'square') {
    netW = netH = t
    w = netW; h = netH; padX = padY = 0
  } else if (layout.mode === 'fit32') {
    const scale = Math.min(1, t / Math.max(bw, bh))
    w = Math.max(32, Math.min(t, Math.round((bw * scale) / 32) * 32))
    h = Math.max(32, Math.min(t, Math.round((bh * scale) / 32) * 32))
    netW = w; netH = h
  } else { // letterbox：等比缩放后居中补边，推理完再裁回来
    const scale = t / Math.max(bw, bh)
    w = Math.max(1, Math.round(bw * scale))
    h = Math.max(1, Math.round(bh * scale))
    netW = netH = t
    padX = Math.floor((t - w) / 2)
    padY = Math.floor((t - h) / 2)
  }

  const cv = document.createElement('canvas')
  cv.width = netW; cv.height = netH
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, netW, netH)
  ctx.drawImage(bmp, padX, padY, w, h)
  return { cv, w: netW, h: netH, crop: layout.mode === 'letterbox' ? { x: padX, y: padY, w, h } : null }
}

/* ---------------- 推理 ---------------- */
/**
 * @param bmp ImageBitmap / canvas
 * @param id 模型 id
 * @returns { w, h, alpha: Uint8Array(0-255), bbox|null }
 */
export async function matte(bmp, id, onStage) {
  const m = modelById(id)
  if (!m) throw new Error('未知模型：' + id)
  const s = await ensureModel(id)
  onStage && onStage('预处理…')
  const { cv, w, h, crop } = layoutInput(bmp, m.layout)

  const src = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const n = w * h
  const input = new Float32Array(3 * n)
  const [mr, mg, mb] = m.norm.mean
  const [sr, sg, sb] = m.norm.std
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    input[i] = (src[j] / 255 - mr) / sr
    input[n + i] = (src[j + 1] / 255 - mg) / sg
    input[2 * n + i] = (src[j + 2] / 255 - mb) / sb
  }
  const name = m.inputName || s.inputNames[0]
  const feeds = {}
  feeds[name] = new ort.Tensor('float32', input, [1, 3, h, w])

  onStage && onStage('推理中…')
  const out = await s.run(feeds)
  const raw = out[s.outputNames[0]].data

  // 部分模型输出 logits，需要 sigmoid 压回 0~1
  let min = Infinity, max = -Infinity
  for (let i = 0; i < raw.length; i++) { const v = raw[i]; if (v < min) min = v; if (v > max) max = v }
  const needSigmoid = min < 0 || max > 1

  onStage && onStage('合成蒙版…')
  const small = document.createElement('canvas')
  small.width = w; small.height = h
  const sctx = small.getContext('2d', { willReadFrequently: true })
  const idat = sctx.createImageData(w, h)
  for (let i = 0; i < n; i++) {
    let v = raw[i]
    if (needSigmoid) v = 1 / (1 + Math.exp(-v))
    const g = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0
    idat.data[i * 4] = g; idat.data[i * 4 + 1] = g; idat.data[i * 4 + 2] = g; idat.data[i * 4 + 3] = 255
  }
  sctx.putImageData(idat, 0, 0)

  // 裁掉补边 → 拉回原图尺寸
  const src2 = crop ? cropCanvas(small, crop) : small
  const full = document.createElement('canvas')
  full.width = bmp.width; full.height = bmp.height
  const fctx = full.getContext('2d', { willReadFrequently: true })
  fctx.imageSmoothingEnabled = true
  fctx.imageSmoothingQuality = 'high'
  fctx.drawImage(src2, 0, 0, bmp.width, bmp.height)
  const fd = fctx.getImageData(0, 0, bmp.width, bmp.height).data

  const alpha = new Uint8Array(bmp.width * bmp.height)
  let x0 = bmp.width, y0 = bmp.height, x1 = -1, y1 = -1, cnt = 0
  for (let y = 0; y < bmp.height; y++) {
    const row = y * bmp.width
    for (let x = 0; x < bmp.width; x++) {
      const a = fd[(row + x) * 4]
      alpha[row + x] = a
      if (a >= 128) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        cnt++
      }
    }
  }
  return { w: bmp.width, h: bmp.height, alpha, bbox: cnt > 32 ? { x0, y0, x1, y1 } : null }
}

function cropCanvas(cv, crop) {
  const out = document.createElement('canvas')
  out.width = crop.w; out.height = crop.h
  out.getContext('2d').drawImage(cv, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  return out
}

/* ---------------- 输出合成 ---------------- */
/**
 * 把 alpha 蒙版按参数合成到原图
 * opts: { feather 边缘羽化px, cutoff 去雾阈值, bg 'alpha'|'white'|'color'|'mask', color 背景色 }
 */
export function compose(bmp, alpha, opts) {
  const o = Object.assign({ feather: 0, cutoff: 0.02, bg: 'alpha', color: '#ffffff' }, opts)
  const W = bmp.width, H = bmp.height

  // 蒙版 → canvas（可选羽化）
  const mc = document.createElement('canvas')
  mc.width = W; mc.height = H
  const mctx = mc.getContext('2d', { willReadFrequently: true })
  const mid = mctx.createImageData(W, H)
  const low = o.cutoff
  for (let i = 0; i < W * H; i++) {
    let a = alpha[i] / 255
    if (low > 0) a = (a - low) / (1 - low)
    a = a <= 0 ? 0 : a >= 1 ? 1 : a
    const g = (a * 255 + 0.5) | 0
    mid.data[i * 4] = g; mid.data[i * 4 + 1] = g; mid.data[i * 4 + 2] = g; mid.data[i * 4 + 3] = 255
  }
  mctx.putImageData(mid, 0, 0)

  let maskSrc = mc
  if (o.feather > 0) {
    const blur = document.createElement('canvas')
    blur.width = W; blur.height = H
    const bctx = blur.getContext('2d', { willReadFrequently: true })
    bctx.filter = 'blur(' + o.feather + 'px)'
    bctx.drawImage(mc, 0, 0)
    bctx.filter = 'none'
    maskSrc = blur
  }
  const md = maskSrc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data

  // 原图
  const base = document.createElement('canvas')
  base.width = W; base.height = H
  base.getContext('2d').drawImage(bmp, 0, 0)
  const bd = base.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data

  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const octx = out.getContext('2d')
  const od = octx.createImageData(W, H)

  let bg = null
  if (o.bg === 'white') bg = [255, 255, 255]
  else if (o.bg === 'color') {
    const hex = (o.color || '#ffffff').replace('#', '')
    bg = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }

  for (let i = 0; i < W * H; i++) {
    const j = i * 4
    const a = md[j] / 255
    if (o.bg === 'mask') {
      const g = (a * 255) | 0
      od.data[j] = g; od.data[j + 1] = g; od.data[j + 2] = g; od.data[j + 3] = 255
    } else if (bg) {
      od.data[j] = bd[j] * a + bg[0] * (1 - a)
      od.data[j + 1] = bd[j + 1] * a + bg[1] * (1 - a)
      od.data[j + 2] = bd[j + 2] * a + bg[2] * (1 - a)
      od.data[j + 3] = 255
    } else {
      od.data[j] = bd[j]
      od.data[j + 1] = bd[j + 1]
      od.data[j + 2] = bd[j + 2]
      od.data[j + 3] = (a * 255) | 0
    }
  }
  octx.putImageData(od, 0, 0)
  return out
}
