/* 零依赖静态服务：正确返回 wasm / mjs / onnx 的 MIME，本地预览用 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')

const ROOT = __dirname
const PORT = Number(process.env.PORT || 5199)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
}

http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname)
  if (pathname === '/') pathname = '/index.html'
  const file = path.join(ROOT, pathname)
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + pathname); return }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(buf)
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log('AI 抠图工坊 → http://127.0.0.1:' + PORT)
})
