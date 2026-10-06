# 牛盾聚合支付 Open SDK for Node.js

牛盾聚合支付 开放支付平台 Node.js SDK（TypeScript），封装支付下单、关闭、退款、订单查询与回调验签。

> **适配 牛盾聚合支付 Open ≥ 1.0** · **Node.js 18+** · Apache-2.0 · 零运行时依赖（内置 `crypto` + `fetch`）

## 功能

- RSA 双向签名（SHA256withRSA，`crypto.sign`），自动签名请求 / 验签响应与回调
- 走 JSON 签名路径，与开源版后端 `reqTime` 契约对齐
- **15 个开放接口全覆盖**：支付（pay / close / 查单 / 同步）、退款（refund / 查单 / 同步）、
  转账（transfer / 查单 / 同步）、分账（alloc / 查单 / 同步）、网关（pre-pay / query）+ 自检探针
- 联调回显钩子：`client.setObserver({ onRequest, onResponse })` 取「签名后请求体 + 平台原始响应」，
  不设置则零开销
- 异步回调验签
- 完整 TypeScript 类型（金额一律 `number`，单位**分**）

## 安装（源码引入）

```bash
# Gitee（主仓）
npm install git+https://gitee.com/qyyapp/niudun-pay-node.git
# GitHub（镜像）
npm install github:vipluosong/niudun-pay-node
```

```ts
import { NiuDunClient, Config } from '@niudun/open-sdk'
```

## 快速开始

```ts
const client = new NiuDunClient({
  serviceUrl: 'https://sandbox.niudunpay.cn',
  mchNo: 'M200000001',
  appId: 'APP001',
  privateKey: merchantPrivateKeyPem,    // PEM 文本
  publicKey: platformPublicKeyPem,       // PEM 文本
  timeout: 30000,
})

// 支付下单
const result = await client.pay({
  bizOrderNo: 'PAY20250805001',
  title: '测试商品',
  amount: 100,            // 分
  method: 'wechat_qr',
  notifyUrl: 'https://example.com/notify',
})

// 回调验签
// const ok = client.verifyNotice(rawBody)
```

> 完整可运行示例见 [`examples/pay.ts`](examples/pay.ts)。

## 联调 Demo（推荐入门方式）

仓内自带一个**单命令启动的联调 Demo**：调试页 + 全接口表单 + 回调接收，
所有交易调用都经 `NiuDunClient` 真实签名发出，同时验证 SDK 与平台接口两侧。

### 1. 启动（无需任何配置文件）

```bash
# 必须先构建 SDK 产物 dist/（demo 服务端是纯 JS，从 dist/index.js 导入已编译 SDK；
# 直接跑 .ts 会因源码的相对导入未写扩展名而 ERR_MODULE_NOT_FOUND）
npm run build && node demo/server.mjs
```

浏览器打开 <http://127.0.0.1:9792>，页面为**三栏布局**：左侧接口导航（5 个业务域 / 15 个接口）、
中间表单与结果、右侧**随表单实时生成的 SDK 调用代码**（TypeScript，可直接复制到项目里用）。

点击右上角 **「连接配置」** 打开弹窗填写参数，保存即生效：

| 配置项 | 说明 |
|--------|------|
| 平台服务地址 | 如 `http://127.0.0.1:9999` |
| 商户号 / 应用号 | 应用号可空（回落平台默认应用） |
| 商户私钥 | PKCS#8 PEM，粘贴后即时校验格式 |
| 平台公钥 | X.509 PEM，用于响应与回调验签 |

弹窗内 **「测试连接」** 按钮会经服务端中转调用平台自检探针 `GET /unipay/callback/ping`
（浏览器直连平台地址会跨域），可快速区分「地址写错」「网关未放行 /unipay/callback 前缀」「后端未启动」。
注意探针需平台版本包含该端点（`UnipayPingController`），旧版本会返回 401。

配置保存在**浏览器 localStorage**（仅本机、服务端不落盘），服务重启后打开页面自动恢复。

可选命令行参数：`--port=9792` 更换监听端口。本仓 demo 不做配置文件（页面内配置已覆盖全部场景）。

### 2. 使用

- 左侧导航切换 **15 个开放接口**（支付 / 退款 / 转账 / 分账 / 网关五族），
  每个接口的表单都带必填校验与类型校验，嵌套结构（商品明细 / 终端信息 / 转账报备 / 分账接收方）
  用可增删的行编辑器填写
- 结果区回显「SDK 签名后的完整请求体 + 平台原始响应 + 响应验签结果 + 耗时」，
  支付类接口单独透出 `payBody` / `h5Url` / `miniUrl` / `confirmUrl` 等跳转地址；
  平台业务异常响应不带签名，页面显示「响应未签名（平台异常响应）」而非验签失败
- **回调通知记录** 区实时轮询展示平台异步通知（自动验签）；
  表单 `notifyUrl` 填 Demo 提示的回调地址（默认已填好 `http://127.0.0.1:9792/callback/pay`）
  即可完成「支付 → 回调 → 验签」全链路闭环

## 接口文档

- [接入准备](https://doc.open.niudun.cn/api/getting-started) · [签名规则](https://doc.open.niudun.cn/api/signature)
- 黄金测试向量：见 [`test/golden-vector.test.ts`](test/golden-vector.test.ts)（与后端签名契约同源断言）

## License

Apache-2.0，可自由用于商业项目与闭源集成，协议全文见 [LICENSE](LICENSE)。主仓库 [牛盾聚合支付 Open](https://gitee.com/qyyapp) 核心为 LGPL-3.0-or-later，本 SDK 作为独立仓按 Apache-2.0 单独发布。

## 开源许可与来源

本项目基于开源支付 SDK（**Apache License 2.0**）改造，
按牛盾聚合支付的命名规则重命名并适配，核心签名验签协议保持一致。

本项目沿用同一许可协议，协议全文见 `LICENSE`；修改后的内容均在源码中可见。
