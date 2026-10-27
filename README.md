# AI Cutout Studio · AI 抠图工坊

> Pick what's in your photo, and the tool automatically runs the model that's best at that subject. Inference happens in your browser — the image never leaves your machine, and no model is ever loaded from this site's server.

**English** | [简体中文](README.zh-CN.md)

<a href="https://bushimashen.github.io/ai-cutout/"><b>▶ Live demo</b></a>

## Why "pick the subject"

Most matting tools ship one general-purpose model and hope for the best. That fails in predictable ways:
a general model eats the flyaway hair of a portrait, muddles the flat shading of a 3D figure, or
leaves a halo around a translucent bottle. Different subjects genuinely need different architectures.

So the UI starts by asking **what the photo contains**, then loads the model that is strong at that domain:

| Subject | Recommended model | Why |
|---|---|---|
| Portrait photo | MODNet (quantized, 6.3 MB) | Trained on portraits; keeps fine hair edges, tiny download |
| Chibi / 3D / figurine | RMBG-1.4 (44 MB) | Strong on flat-shaded, hard-edged synthetic subjects |
| Anime / 2D | ISNet-IS (168 MB) | Handles line art and cel shading where photo models produce mush |
| Product / still life | RMBG-1.4 | Clean silhouettes, keeps specular highlights |
| Fine hair / translucent | ISNet-IS or manual upload | Dense alpha edges need the high-res model |

A general-purpose model is always offered as the fallback, and any ONNX matting model can be **uploaded manually** if it's not reachable from your network.

## Where the models come from

Three sources, tried in order:

1. **Local cache** — once downloaded, a model lives in the browser's IndexedDB. Reopening the page uses the cache and never re-downloads.
2. **Direct link** — the `url` / `mirror` fields in `assets/models.js`. The **browser** fetches from a public model host with CORS; this site's server is not in the path.
3. **Manual upload** — click "upload .onnx" on the page. The file goes into the same IndexedDB cache.

> Models are deliberately **not** stored in this repository or on the site — see [Model licences](#model-licences).

## Project layout

```
ai-cutout/
├── index.html                  page structure
├── assets/
│   ├── models.js               ★ single source of truth: subject types / model list / specs / download links
│   ├── matting.js              engine: download+cache / preprocess / inference / composite
│   ├── app.js                  page logic
│   └── style.css               styles
├── runtime/onnxruntime/        inference runtime (WASM + WebGPU) — must be served with the site
├── samples/                    sample images
├── 模型/                       local archive only (ONNX files are gitignored, not part of the repo)
├── server.js                   dependency-free local static server (correct wasm/mjs MIME)
└── 启动本地服务.bat            double-click to run locally on Windows
```

## Running locally

```bash
node server.js          # http://127.0.0.1:5199
```

Or double-click `启动本地服务.bat` on Windows.

> Opening `index.html` via `file://` will not work: browsers refuse to instantiate WASM from a `file://` origin. Use the server above.

## Deploying

The whole directory is static. Three things matter:

1. `.wasm` must be served as `application/wasm`, and `.mjs` as `text/javascript` (`server.js` and Nginx both need this). Get either wrong and the page loads but inference dies with `initWasm() failed`.
2. `runtime/` can be cached aggressively (its content is fixed); use revalidation for `assets/`.
3. **Never put the ONNX models in the site directory** — the site only serves the page and the runtime.

The site runs without COOP/COEP headers, so the WASM backend is pinned to a single thread. WebGPU is tried first and falls back to WASM automatically.

## Extending it

- **Add a model**: append an entry to `MODELS` in `assets/models.js` with `category`, `file`, `sizeMB`, `url` (may be empty), `layout` (`square` / `fit32` / `letterbox`), `norm` (`v = (x/255 - mean) / std`) and `inputName` (optional, auto-detected). Then reference it from `SUBJECT_TYPES`.
- **Swap the backend**: `assets/matting.js` is the only place that talks to onnxruntime.

## Model licences

The ONNX weights are **not** distributed with this repository. Each model keeps its own upstream licence, which you must check before any commercial use — several public matting models are research- or non-commercial-only. The MIT licence below covers **this project's source code only**.

## Licence

MIT — see [LICENSE](LICENSE). The bundled `runtime/onnxruntime/` files are the official onnxruntime-web build, also MIT.
