# 二次元动漫

**推荐模型：ISNetIS**

- 文件名：`isnetis.onnx`（168 MB）
- 在线直链：`https://hf-mirror.com/skytnt/anime-seg/resolve/main/isnetis.onnx`
- 擅长：动漫插画 / 游戏立绘 / 漫画，平涂线稿的发丝、饰品、透明裙摆细节最好
- 不擅长：写实照片（不如通用模型）；文件大，首次下载慢
- 预处理：等比缩放 + 居中补边到 1024×1024，推理后裁回原比例（推理器已内置）

> 168MB 一定要走网盘分流：把文件传网盘、把链接填进 `assets/models.js` 的 `NETDISK.links`（id: `isnetis`），  
> 让用户从网盘下、再「手动上传 .onnx」，比挤直链稳得多。
