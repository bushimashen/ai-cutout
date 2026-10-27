# 人像照片

**推荐模型：MODNet（int8 量化）**

- 文件名：`modnet_quantized.onnx`（6.3 MB）
- 在线直链：`https://hf-mirror.com/Xenova/modnet/resolve/main/onnx/model_quantized.onnx`（浏览器端直下，带 CORS）
- 擅长：真人半身 / 证件照 / 头像 / 直播截图，0.3 秒出图，边缘干净
- 不擅长：非人像目标（手办、宠物会整片丢）、复杂背景
- 授权：MIT

## 放到网盘 / 手动上传

1. 下载上面的 `.onnx` 文件到本目录；
2. 上传到你的网盘，把分享链接填进 `assets/models.js` 的 `NETDISK.links`（id: `modnet`）；
3. 用户在本分类对应模型卡片上点「手动上传 .onnx」即可使用，文件会缓存到浏览器 IndexedDB。

> 这个文件**不要**放进站点服务器目录——模型一律由用户浏览器端下载或手动上传。
