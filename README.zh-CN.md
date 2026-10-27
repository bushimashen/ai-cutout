# AI 抠图工坊 · AI Cutout Studio

> 先告诉工具「这张图拍的是什么」，它自动选用最擅长该领域的模型去抠。推理全程在你的浏览器里跑，图片不出本机，模型也不占站点服务器带宽。

[English](README.md) | **简体中文**

<a href="https://bushimashen.github.io/ai-cutout/"><b>▶ 在线试用</b></a>

## 为什么按主体选模型

多数抠图工具只挂一个通用模型硬啃所有素材，结果是可以预期的：通用模型会把头像的发丝糊掉、
把 3D 手办的硬边啃软、在半透明瓶身周围留一圈灰边。不同主体本来就该用不同架构的模型。

所以界面第一步问的是**图里是什么**，再加载该领域表现最好的那个：

| 主体类型 | 推荐模型 | 为什么 |
|---|---|---|
| 真人像照片 | MODNet（量化版 6.3 MB） | 专为人像训练，发丝边缘保留较好，体积最小 |
| Q 版 / 3D / 手办 | RMBG-1.4（44 MB） | 对平涂、硬边的合成主体判得准 |
| 二次元动漫 | ISNet-IS（168 MB） | 能处理线稿与赛璐璐上色，照片模型在这类图上会糊成一片 |
| 商品 / 静物 | RMBG-1.4 | 轮廓干净，高光不会被当成背景吃掉 |
| 精细毛发 / 半透明 | ISNet-IS 或手动上传 | 密集 alpha 边缘需要高分辨率模型 |

页面上始终提供通用模型作为兜底；网络上拿不到的 ONNX 抠图模型可以**手动上传**。

## 模型从哪来

三条来源，按顺序自动尝试：

1. **本机缓存** —— 下载过的模型存在浏览器 IndexedDB，下次打开直接用，不再重复下载。
2. **在线直链** —— `assets/models.js` 里的 `url` / `mirror`，由**用户浏览器**从公开模型站直接拉取（带 CORS），不经过本站服务器。
3. **手动上传** —— 点页面上的「上传 .onnx」，文件同样进本机缓存。

> 模型**刻意不入库、不上站**，原因见下文 [模型许可](#模型许可)。

## 目录结构

```
ai-cutout/
├── index.html              页面结构
├── assets/
│   ├── models.js           ★ 唯一数据源：主体类型 / 模型清单 / 输入规格 / 下载直链
│   ├── matting.js          推理引擎：下载缓存 / 预处理 / 推理 / 合成输出
│   ├── app.js              页面逻辑
│   └── style.css           样式
├── runtime/onnxruntime/    推理运行时（WASM + WebGPU），必须随站点一起托管
├── samples/                示例图
├── 模型/                   本地归档用目录（ONNX 已被 .gitignore 排除，不在仓库里）
├── server.js               零依赖本地静态服务（带 wasm/mjs 正确 MIME）
└── 启动本地服务.bat        Windows 双击启动
```

## 本地跑起来

```bash
node server.js          # 默认 http://127.0.0.1:5199
```

Windows 也可以直接双击 `启动本地服务.bat`。

> 用 `file://` 直接打开 `index.html` 是不行的：浏览器不允许从 `file://` 源实例化 WASM，必须走上面的本地服务。

## 部署

整个目录是纯静态文件，丢到任意静态托管（Nginx / OSS / Pages）即可，注意三点：

1. `.wasm` 必须返回 `application/wasm`，`.mjs` 必须返回 `text/javascript`（`server.js` 与 Nginx 都要配）。
   这两项配错的表现是**页面能打开、但推理报 `initWasm() failed`**。
2. `runtime/` 建议开强缓存（内容固定不变），`assets/` 用协商缓存。
3. **不要把 ONNX 模型放进站点目录** —— 站点只提供页面与运行时。

站点未开启 COOP/COEP，因此 WASM 后端线程数固定为 1；运行时优先尝试 WebGPU，失败自动回落 WASM。

## 怎么改

- **加一个模型**：往 `assets/models.js` 的 `MODELS` 里加一条，填 `category`、`file`、`sizeMB`、`url`（可留空）、
  `layout`（`square` / `fit32` / `letterbox`）、`norm`（`v = (x/255 - mean) / std`）、`inputName`（可留空自动识别），
  再把它挂到 `SUBJECT_TYPES` 某个主体类型的 `recommend` 或 `alt` 里。
- **换推理后端**：只需要动 `assets/matting.js`，它是唯一与 onnxruntime 打交道的地方。

## 模型许可

ONNX 权重**不分发在仓库里**。每个模型各自保留上游许可，商用前请自行确认——公开抠图模型里有不少是
「仅研究 / 禁商用」的。下方 MIT 仅覆盖**本项目源码**。

## 许可

MIT —— 见 [LICENSE](LICENSE)。随附的 `runtime/onnxruntime/` 是 onnxruntime-web 官方构建，同为 MIT。
