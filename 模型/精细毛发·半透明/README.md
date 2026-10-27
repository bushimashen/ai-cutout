# 精细毛发 · 半透明

**推荐模型：RMBG-1.4（见「Q版·3D·手办」目录）／备选：BiRefNet-lite（精细，需手动准备）**

## BiRefNet-lite（可选，需手动准备）

- 文件名：`birefnet_lite.onnx`（约 100 MB，随导出参数浮动）
- 在线直链：**暂无**（官方仓库只提供 `.pth` 权重，需要自行导出 ONNX）
- 获取方式：从 BiRefNet 官方仓库（ZhengPeng7/BiRefNet）取权重后按仓库脚本导出 ONNX，  
  放到本目录、上传网盘
- 擅长：飘发、羽毛、婚纱、玻璃杯这类最细的边缘，目前开源第一梯队
- 不擅长：体积大、10~20 秒一张；低配电脑可能吃力
- 授权：MIT

> 导出后记得在 `assets/models.js` 里校准 `layout` / `norm`（BiRefNet 通常是 1024×1024 + ImageNet 归一化），  
> 并把 `NETDISK.links` 里 id `birefnet_lite` 的链接补上，用户就能网盘下载后手动上传。
