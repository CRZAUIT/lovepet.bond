# 喵链小程序对接说明

本文档供 WorkBuddy 等 AI 开发工具直接阅读。目标：把 https://lovepet.bond 的浏览与投稿功能做成原生微信小程序。

## 给 WorkBuddy 的开场指令

> 请先完整阅读仓库根目录的 `MINIPROGRAM.md`，再阅读 `cats.json`、`volunteers.json`、`videos.json`、`styles.css` 以及 `server.js` 中的 `/api` 部分。把现有网站做成原生微信小程序。先输出目录结构和实施计划，等我确认后再写代码。

## 1. 项目信息

- 线上网站：https://lovepet.bond
- GitHub 仓库：https://github.com/CRZAUIT/lovepet.bond （main 分支，公开）
- 技术栈：原生小程序（WXML / WXSS / JS），不要使用 Taro、uni-app 或第三方 UI 库
- 视觉参考：仓库根目录 `styles.css` 的配色、圆角卡片和字体风格
- 小程序只做前台浏览和投稿；网页后台管理不做进小程序

## 2. 网络要求

- 接口根地址：`https://lovepet.bond`
- 必须使用 HTTPS，不接受 IP 地址
- 微信公众平台需要把 `lovepet.bond` 加入 `request 合法域名` 和 `downloadFile 合法域名`
- 微信要求服务器域名已完成 ICP 备案。当前服务器在香港、域名未备案，正式版可能无法添加。可选方案：
  1. 微信云开发云函数中转：小程序调用云函数，云函数再请求 `https://lovepet.bond`（云函数不受域名白名单限制），推荐用于 MVP
  2. 域名备案并接入大陆服务器/CDN
  3. 开发阶段在微信开发者工具中勾选“不校验合法域名”
- 图片和视频地址由接口返回相对路径，客户端统一拼接为 `https://lovepet.bond/` + 路径

## 3. 数据接口

统一约定：

- 返回 JSON，UTF-8
- GET 接口无需登录
- 失败返回 `{ "error": "错误说明" }`
- `timestamp` 为 Unix 秒级时间戳
- `photo`、`poster`、`src` 都是相对路径，需要拼接域名

### GET /api/cats

猫咪档案列表。

```json
[
  {
    "catId": "cat-001",
    "name": "小黑",
    "photo": "cats/小黑/小黑的profile.jpg",
    "description": "小黑，黑乎乎的，粘人……",
    "location": "武汉市洪山区华中农业大学西苑食堂后院"
  }
]
```

说明：`name` 可能带后缀，例如 `布丁(已领养)`。列表可原样展示，分享卡片上建议去掉括号内容。

### GET /api/volunteers

志愿者档案列表。

```json
[
  {
    "volunteerId": "vol-001",
    "name": "小赵",
    "photo": "volunteers/小赵/小赵的profile.jpg",
    "matchNames": ["小赵"],
    "location": "东莞城市学院",
    "description": "lovepet 创始人……"
  }
]
```

志愿者详情页需要帮助记录时，先请求 `/api/helps`，再按 `matchNames` 过滤：`helperName` 包含任一 `matchNames` 即算该志愿者的记录。

### GET /api/videos?catId=cat-008

日常视频列表，`catId` 可选。

```json
[
  {
    "videoId": "v-001",
    "catId": "cat-008",
    "title": "第一次遇到朝阳",
    "src": "cats/朝阳/第一次遇到朝阳.mp4",
    "poster": "cats/朝阳/朝阳的profile.jpg",
    "date": "2026-10-12"
  }
]
```

### GET /api/helps?catId=cat-008

链上帮助记录，`catId` 可选；最多返回最近 200 条。

```json
{
  "total": 6,
  "helps": [
    {
      "helperName": "小赵",
      "catId": "cat-008",
      "action": "第一次遇见朝阳",
      "message": "眼睛大大的，毛发亮堂……",
      "proofHash": "bafybeicye7ik45fjh5p6kby2njh7odcrlyrxnltqsdgs6d76xgyaq2gkqu",
      "timestamp": 1791790604
    }
  ]
}
```

凭证链接格式：`https://aqua-tricky-peafowl-770.mypinata.cloud/ipfs/` + `proofHash`。
`proofHash` 为空时显示 `-`。

### GET /api/cat-photos

每只猫文件夹内的所有图片，用于投稿时选择配图。

```json
{
  "cat-001": ["cats/小黑/小黑的profile.jpg"],
  "cat-008": ["cats/朝阳/pic(11).jpg", "cats/朝阳/朝阳的profile.jpg"]
}
```

### POST /api/submit

提交投稿。请求体为 JSON，字段与网页投稿表单一致。

| 字段 | 必填 | 限制 | 说明 |
|---|---|---|---|
| `name` | 是 | 20 字 | 投稿人称呼 |
| `contact` | 是 | 60 字 | 联系方式 |
| `catId` | 否 | 40 字 | 默认 `other`；其他值必须存在于 `/api/cats` |
| `otherName` | 否 | 10 字 | 未建档猫咪的名字 |
| `otherPlace` | 否 | 60 字 | `catId=other` 时必填，遇见地点 |
| `action` | 是 | 最多 8 项 | 用 `、` 连接，取值见下 |
| `message` | 是 | 200 字 | 想留下的话 |
| `photo` | 否 | 200 字 | 必须是 `/api/cat-photos` 返回的路径之一，否则回退到猫咪主图 |
| `cardTheme` | 否 | - | `cream` / `mint` / `sakura` / `night`，默认 `cream` |
| `stickerPack` | 否 | - | `flower` / `sakura` / `star` / `none`，默认 `flower` |
| `website` | 否 | - | 蜜罐字段，必须留空或不传 |

`action` 允许值：`投喂`、`绝育`、`送医`、`领养`、`找家`、`临时照顾`、`陪伴`、`其他`。

成功返回 `{ "ok": true }`。每个 IP 每 24 小时最多 5 条，超限返回 429。小程序端不要自动重试。

## 4. 页面规划

| 页面 | 路径 | 数据来源 |
|---|---|---|
| 首页 | `pages/index/index` | `/api/cats`、`/api/volunteers`、`/api/helps` |
| 猫咪详情 | `pages/cat/cat?catId=xxx` | `/api/cats`、`/api/videos`、`/api/helps`、`/api/cat-photos` |
| 志愿者详情 | `pages/volunteer/volunteer?volunteerId=xxx` | `/api/volunteers`、`/api/cats`、`/api/helps` |
| 投稿 | `pages/submit/submit?catId=xxx` | `/api/cats`、`/api/cat-photos`、POST `/api/submit` |
| 分享卡片 | `pages/card/card` | 使用投稿页数据，Canvas 2D 本地绘制 |

补充要求：

- 首页统计：猫咪数量取 `/api/cats` 长度，帮助总数取 `/api/helps` 的 `total`
- 猫咪详情页照片可做成横向滑动，视频使用原生 `video` 组件
- 分享卡片尺寸 1080x1440，使用 Canvas 2D 绘制，不要使用 `html-to-image`
- 保存图片使用 `wx.saveImageToPhotosAlbum`，并处理用户拒绝授权的情况
- 所有页面都需要加载态、空状态和错误状态
- 适配 iPhone 底部安全区

## 5. 安全约束

- 不实现任何捐赠、收款、支付、募捐功能
- 不调用 `/api/miao-admin-*` 接口，不读取 `admin.html`、`admin-password.txt`、`submissions.json`
- 不在小程序代码中写入任何账号、密码、密钥、服务器地址（SSH）
- 不接入百度统计，使用微信自带统计
- 不要把接口数据直接拼进 `rich-text` 或未转义的模板；`message`、`helperName` 等按纯文本渲染

## 6. 验收标准

- 微信开发者工具无报错，真机预览正常
- 首页、猫咪详情、志愿者详情的数据均来自上述接口
- 投稿成功后，能在网页后台看到该条记录
- 分享卡片能生成并保存到相册
- 代码中不出现任何密钥、密码、服务器凭据
- 不包含捐赠、支付相关页面或入口

## 7. 交付方式

推荐流程：

1. 把仓库地址 `https://github.com/CRZAUIT/lovepet.bond` 发给 WorkBuddy
2. 附上本文开头的开场指令
3. 让 WorkBuddy 先输出目录结构和计划，确认后再分阶段实现：只读页面 → 投稿 → 分享卡片
4. 每个阶段在微信开发者工具里验收后再继续

如果 WorkBuddy 无法访问 GitHub，在仓库页面下载 ZIP 上传，开场指令不变。

不要把服务器 SSH、`admin-password.txt`、任何密钥交给 WorkBuddy。

## 8. 后端部署说明

新增接口依赖 `ethers` 读取链上帮助记录：

```bash
npm install
node server.js
```

服务器更新后需要重启 systemd 服务：

```bash
systemctl restart miao
```
