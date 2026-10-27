/* ============================================================
   模型清单：整个工具站唯一的数据源
   - category 与「模型/」下的中文分类目录一一对应（用户把模型分门别类放好，再传网盘）
   - url / mirror：浏览器端直接下载的直链（不是本站服务器），都带 CORS
   - url 为空 = 国内暂无可用直链，只能「网盘下载 → 手动上传」
   - layout / norm：每个模型的输入规格，推理器按这份配置走
   ============================================================ */

/** 中文分类目录（与磁盘上的文件夹同名） */
export const CATEGORIES = [
  { key: 'portrait', dir: '人像照片', label: '真人像照片', hint: '证件照 / 头像 / 半身 / 直播截图' },
  { key: 'chibi3d', dir: 'Q版·3D·手办', label: 'Q版 · 3D · 手办', hint: 'Q版角色 / 3D 渲染 / 手办玩偶 / 宠物' },
  { key: 'anime2d', dir: '二次元动漫', label: '二次元动漫', hint: '动漫插画 / 游戏立绘 / 漫画 / 二次元角色' },
  { key: 'product', dir: '商品·静物', label: '商品 · 静物', hint: '电商白底图 / 产品 / 静物 / 包装' },
  { key: 'hair', dir: '精细毛发·半透明', label: '精细毛发 · 半透明', hint: '飘发 / 羽毛 / 婚纱 / 玻璃杯' }
]

/**
 * 模型规格
 * layout.mode: square=拉伸到 target×target | fit32=最长边缩到 target 且边长取 32 倍数 | letterbox=等比缩放+居中补边（再裁回）
 * norm:        v = (x/255 - mean) / std
 */
export const MODELS = [
  {
    id: 'modnet',
    name: 'MODNet（int8 量化）',
    category: 'portrait',
    file: 'modnet_quantized.onnx',
    sizeMB: 6.3,
    url: 'https://hf-mirror.com/Xenova/modnet/resolve/main/onnx/model_quantized.onnx',
    mirror: '',
    inputName: 'input',
    layout: { target: 512, mode: 'fit32' },
    norm: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
    good: '真人半身 / 证件照 / 头像，秒出，边缘干净',
    bad: '只认人像，拿去抠手办、宠物会整片丢；复杂背景略吃力',
    license: 'MIT',
    speed: '约 0.3 秒 / 张'
  },
  {
    id: 'rmbg14',
    name: 'RMBG-1.4（int8 量化）',
    category: 'chibi3d',
    file: 'rmbg14_quantized.onnx',
    sizeMB: 44,
    url: 'https://www.modelscope.cn/models/AI-ModelScope/RMBG-1.4/resolve/master/onnx/model_quantized.onnx',
    mirror: '',
    inputName: '',
    layout: { target: 1024, mode: 'square' },
    norm: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
    good: 'Q版 / 3D 渲染 / 手办 / 商品 / 动物通吃，语义识别准，是最稳的默认选项',
    bad: '非商业授权；输入固定 1024，超大图的极细边缘有上限',
    license: '非商业用途免费',
    speed: '约 3~6 秒 / 张'
  },
  {
    id: 'isnetis',
    name: 'ISNetIS（动漫专用）',
    category: 'anime2d',
    file: 'isnetis.onnx',
    sizeMB: 168,
    url: 'https://hf-mirror.com/skytnt/anime-seg/resolve/main/isnetis.onnx',
    mirror: '',
    inputName: 'img',
    layout: { target: 1024, mode: 'letterbox' },
    norm: { mean: [0, 0, 0], std: [1, 1, 1] },
    good: '二次元线稿 / 平涂插画的发丝、饰品、透明裙摆，细节最好',
    bad: '168MB 首次下载慢；写实照片别用它（效果不如通用模型）',
    license: '见模型仓库说明',
    speed: '约 8~15 秒 / 张'
  },
  {
    id: 'u2netp',
    name: 'U²-Netp（极速轻量）',
    category: 'product',
    file: 'u2netp.onnx',
    sizeMB: 4.7,
    url: '',
    mirror: '',
    inputName: '',
    layout: { target: 320, mode: 'letterbox' },
    norm: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
    good: '4.7MB 秒下，边缘清楚的商品白底图最快',
    bad: '输出偏硬边，发丝与半透明基本没戏；国内暂无直链，需网盘下载后手动上传',
    license: 'Apache-2.0',
    speed: '约 0.2 秒 / 张'
  },
  {
    id: 'birefnet_lite',
    name: 'BiRefNet-lite（精细）',
    category: 'hair',
    file: 'birefnet_lite.onnx',
    sizeMB: 100,
    url: '',
    mirror: '',
    inputName: '',
    layout: { target: 1024, mode: 'square' },
    norm: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
    good: '飘发、羽毛、婚纱、玻璃杯这类最细的边缘，目前开源里的第一梯队',
    bad: '体积大、推理慢；国内暂无可用直链，需网盘下载后手动上传',
    license: 'MIT',
    speed: '约 10~20 秒 / 张'
  }
]

/** 主体类型：用户只需要回答「我这张图拍的是什么」，模型由这里推荐 */
export const SUBJECT_TYPES = [
  {
    key: 'portrait', label: '真人像照片',
    note: '证件照、头像、半身照优先走人像专用模型，最快也最干净',
    recommend: 'modnet', alt: ['rmbg14']
  },
  {
    key: 'chibi3d', label: 'Q版 · 3D · 手办',
    note: 'Q版角色、3D 渲染、手办玩偶、宠物——通用语义模型最稳',
    recommend: 'rmbg14', alt: ['isnetis']
  },
  {
    key: 'anime2d', label: '二次元动漫',
    note: '插画、立绘、漫画：动漫专用模型对平涂线稿和发丝最准',
    recommend: 'isnetis', alt: ['rmbg14']
  },
  {
    key: 'product', label: '商品 · 静物',
    note: '电商白底图、产品照：边缘硬、背景干净，通用模型足够',
    recommend: 'rmbg14', alt: ['u2netp']
  },
  {
    key: 'hair', label: '精细毛发 · 半透明',
    note: '飘发、羽毛、婚纱、玻璃：普通模型边缘会糊，换精细模型',
    recommend: 'rmbg14', alt: ['birefnet_lite']
  }
]

/**
 * 网盘下载地址（模型由你自己托管，不占站点服务器带宽）。
 * 把 value 换成你上传后的分享链接即可，页面「下载模型」区域会自动展示。
 */
export const NETDISK = {
  tip: '模型文件由本站维护者托管在网盘，下载后在本页「手动上传模型」处选择即可，全程不经过本站服务器。',
  links: [
    { id: 'modnet', label: '人像照片 · MODNet 6.3MB', value: '' },
    { id: 'rmbg14', label: 'Q版·3D·通用 · RMBG-1.4 44MB', value: '' },
    { id: 'isnetis', label: '二次元 · ISNetIS 168MB', value: '' },
    { id: 'u2netp', label: '商品 · U²-Netp 4.7MB（无直链，必须网盘）', value: '' },
    { id: 'birefnet_lite', label: '精细毛发 · BiRefNet-lite 100MB（无直链，必须网盘）', value: '' }
  ]
}

export const modelById = (id) => MODELS.find((m) => m.id === id) || null
export const categoryOf = (id) => {
  const m = modelById(id)
  return m ? CATEGORIES.find((c) => c.key === m.category) : null
}
