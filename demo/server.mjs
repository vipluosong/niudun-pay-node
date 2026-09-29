// 牛盾支付 Node.js SDK 联调 Demo 服务
//
// 单命令启动的本地联调工具，**所有交易调用都经 NiuDunClient 走 SDK 真实调用链**（签名/请求/验签），
// 同时验证 SDK 与平台 unipay 接口两侧：
//
// - `GET /` 内嵌调试页（demo/index.html，运行时读盘）
// - `GET|POST /demo/config` 连接配置：页面弹窗内直接填写服务地址/商户号/密钥，
//   配置保存在**浏览器 localStorage**（服务端只存内存、不落盘）
// - `POST /demo/ping` 连通性自检：服务端代调 `GET /unipay/callback/ping` 探针（浏览器直连平台会跨域）
// - `POST /demo/signed-ping` 签名链路自检：服务端代调 `POST /unipay/ping` 签名探针（「测试连接」第二段，
//   判定当前配置的商户号/应用/商户私钥是否正确、能否发起真实调用）
// - `POST /demo/{action}` 调 SDK 发起真实请求，回显「签名后请求体 + 平台原始响应 + 响应验签结果」；
//   支持全部 15 个开放接口，action 取值见 [ACTIONS]
// - `POST /callback/{pay|refund|transfer|alloc}`（及通用 `/callback`）接收平台异步通知，用平台公钥验签后暂存
// - `GET /demo/callbacks` 回调记录（页面轮询）；`POST /demo/callbacks/clear` 清空
//
// 启动（仓根执行，先构建 SDK 产物 dist/）：
//   npm run build && node demo/server.mjs
// 可选参数：`--port=9792` 监听端口。
//
// HTTP 层用 node:http，不给 SDK 引入任何 Web 框架依赖；SDK 从 ../dist/index.js 导入已编译产物
// （Node 原生执行 .ts 要求相对导入写全扩展名 `from './config.ts'`，而 SDK 源码是无扩展名写法，
// 直接 `node demo/server.ts` 会 ERR_MODULE_NOT_FOUND，故 demo 服务端用纯 JS 消费 dist）。
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

// SDK 编译产物缺失时给出可操作提示（静态 import 无法捕获，改用动态 import）
// 密钥校验复用 SDK 的 validate*（与其它语言同一套容错归一，见 src/rsa.ts）
let NiuDunClient
let validatePrivateKeyPEM
let validatePublicKeyPEM
try {
  ;({ NiuDunClient, validatePrivateKeyPEM, validatePublicKeyPEM } = await import('../dist/index.js'))
} catch (e) {
  console.error('未找到 SDK 编译产物 dist/index.js: ' + (e && e.message))
  console.error('请先在仓根执行: npm run build')
  process.exit(1)
}

/// 回调记录保留上限（超出丢弃最老记录）
const MAX_CALLBACKS = 200

/// 调试页文件（相对本文件定位，运行时读盘，改页面无需重启）
const INDEX_HTML = new URL('./index.html', import.meta.url)

/// action → SDK 调用映射表（15 个业务接口 + 签名自检探针），新增接口只需在此登记一行
const ACTIONS = {
  // 支付族
  pay: (client, p) => client.pay(p),
  close: (client, p) => client.close(p),
  'query-pay-order': (client, p) => client.queryPayOrder(p),
  'sync-pay-order': (client, p) => client.syncPayOrder(p),
  // 退款族
  refund: (client, p) => client.refund(p),
  'query-refund-order': (client, p) => client.queryRefundOrder(p),
  'sync-refund-order': (client, p) => client.syncRefundOrder(p),
  // 转账族
  transfer: (client, p) => client.transfer(p),
  'query-transfer-order': (client, p) => client.queryTransferOrder(p),
  'sync-transfer-order': (client, p) => client.syncTransferOrder(p),
  // 分账族
  alloc: (client, p) => client.alloc(p),
  'query-alloc-order': (client, p) => client.queryAllocOrder(p),
  'sync-alloc-order': (client, p) => client.syncAllocOrder(p),
  // 网关族
  'gateway-pre-pay': (client, p) => client.gatewayPrePay(p),
  'gateway-query': (client, p) => client.gatewayQuery(p),
  // 自检族：探针非 0 码在此转成异常，与其它接口的失败回显行为一致（完整诊断走 /demo/signed-ping）
  'signed-ping': async (client, p) => {
    const r = await client.signedPing(p)
    if (r.code !== 0) {
      throw new Error('[' + r.code + '] ' + r.msg)
    }
  },
}

// 监听端口（--port= 可覆盖）
let port = 9792
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--port=')) {
    port = Number.parseInt(arg.slice('--port='.length), 10)
  }
}

/// 当前生效配置（页面保存时整体替换引用，读方每次取最新快照）
let currentConfig = {
  serviceUrl: 'http://127.0.0.1:9999',
  mchNo: '',
  appId: null,
  privateKey: null,
  publicKey: null,
}

/// 对外可达的回调基址（生成默认 notifyUrl 用，跨机联调时显式配置）
const callbackBase = 'http://127.0.0.1:' + port

/// 回调记录（内存暂存，重启即清；新的在队首）
const callbacks = []

// ==================================================================
// 公共小工具
// ==================================================================

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

/// 当前时间的 GMT+8 字面量（yyyy-MM-dd HH:mm:ss）— 与 SDK/后端时区口径一致
function nowGmt8() {
  const beijing = new Date(Date.now() + 8 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ` +
    `${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`
  )
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(bytes)
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}

// ==================================================================
// /demo/config 连接配置（页面内配置，服务端只存内存不落盘）
// ==================================================================

/// 当前配置的脱敏状态（不返回密钥内容，仅返回是否已配置）
function configInfo() {
  return {
    serviceUrl: currentConfig.serviceUrl,
    mchNo: currentConfig.mchNo || null,
    appId: currentConfig.appId || null,
    callbackBase,
    privateKeySet: !isBlank(currentConfig.privateKey),
    publicKeySet: !isBlank(currentConfig.publicKey),
  }
}

async function handleConfig(req, res, method) {
  if (method === 'GET') {
    sendJson(res, 200, configInfo())
    return
  }
  let body = {}
  try {
    body = JSON.parse((await readBody(req)) || '{}')
  } catch (e) {
    body = {}
  }
  const serviceUrl = String(body.serviceUrl ?? '').trim()
  const mchNo = String(body.mchNo ?? '').trim()
  if (!serviceUrl || !mchNo) {
    sendJson(res, 400, { error: '服务地址与商户号不能为空' })
    return
  }
  // 密钥字段语义：缺省=保持原值；空串=清空；非空=替换（先做 PEM 解析校验，即时反馈格式错误）
  let privateKey = currentConfig.privateKey
  if (Object.hasOwn(body, 'privateKey')) {
    const value = String(body.privateKey ?? '').trim()
    if (!value) {
      privateKey = null
    } else {
      try {
        validatePrivateKeyPEM(value)
      } catch (e) {
        sendJson(res, 400, { error: '商户私钥无效: ' + (e && e.message) })
        return
      }
      privateKey = value
    }
  }
  let publicKey = currentConfig.publicKey
  if (Object.hasOwn(body, 'publicKey')) {
    const value = String(body.publicKey ?? '').trim()
    if (!value) {
      publicKey = null
    } else {
      try {
        validatePublicKeyPEM(value)
      } catch (e) {
        sendJson(res, 400, { error: '平台公钥无效: ' + (e && e.message) })
        return
      }
      publicKey = value
    }
  }
  // 整体替换配置引用（读方每次取最新快照）
  currentConfig = {
    serviceUrl,
    mchNo,
    appId: String(body.appId ?? '').trim() || null,
    privateKey,
    publicKey,
  }
  console.log('[配置] 页面更新连接配置: ' + serviceUrl + ' 商户 ' + mchNo)
  sendJson(res, 200, configInfo())
}

// ==================================================================
// /demo/ping 连通性自检（服务端中转，规避浏览器跨域）
// ==================================================================

/// 代调平台自检探针 `GET /unipay/callback/ping`，供页面「测试连接」按钮使用
async function handlePing(res) {
  const cfg = currentConfig
  const begin = Date.now()
  try {
    const marker = await new NiuDunClient(cfg).ping()
    sendJson(res, 200, {
      serviceUrl: cfg.serviceUrl,
      success: true,
      marker,
      durationMs: Date.now() - begin,
    })
  } catch (e) {
    let msg = String(e && e.message)
    // 401/404 是探针链路上最常见的两种情况，直接给出可操作的排查方向
    if (msg.includes('HTTP 401') || msg.includes('HTTP 404')) {
      msg += '（需平台版本包含部署自检探针 /unipay/callback/ping，且网关放行该前缀）'
    }
    sendJson(res, 200, {
      serviceUrl: cfg.serviceUrl,
      success: false,
      error: msg,
      durationMs: Date.now() - begin,
    })
  }
}

// ==================================================================
// /demo/signed-ping 签名链路自检（服务端中转，规避浏览器跨域）
// ==================================================================

/// 代调签名自检探针 `POST /unipay/ping`，供页面「测试连接」第二段使用：
/// 判定当前配置的商户号/应用/商户私钥/签名串构造是否正确、能否发起真实调用
async function handleSignedPing(res) {
  const cfg = currentConfig
  const result = { serviceUrl: cfg.serviceUrl }
  const begin = Date.now()
  if (isBlank(cfg.privateKey) || isBlank(cfg.publicKey)) {
    result.success = false
    result.hint = isBlank(cfg.privateKey)
      ? '尚未配置商户私钥，请先在「连接配置」中填写'
      : '尚未配置平台公钥（响应无法验签），请先在「连接配置」中填写'
    sendJson(res, 200, result)
    return
  }
  // observer 捕获发出报文与原始响应，供页面比对签名串（发出 JSON vs 服务端待签串）
  const captured = { request: null, response: null }
  const client = new NiuDunClient(cfg).setObserver({
    onRequest: (signedJson) => {
      captured.request = signedJson
    },
    onResponse: (raw) => {
      captured.response = raw
    },
  })
  try {
    const r = await client.signedPing({})
    result.success = r.code === 0
    result.code = r.code
    result.msg = r.msg
    result.data = r.data ?? null
    if (r.code !== 0) {
      result.hint = classifyProbeError(r.code)
    }
  } catch (e) {
    // 走到异常只会是硬错误：网络不通 / HTTP 非 200 / 响应验签失败（平台公钥问题）
    const msg = String(e && e.message)
    result.success = false
    result.error = msg
    if (msg.includes('响应验签失败')) {
      result.hint = '平台响应验签失败：请核对「连接配置」中的平台公钥'
    } else if (msg.includes('HTTP 404')) {
      result.hint = '网关未放行「商户开放 API」(/unipay) 接口组，需在部署面板开启'
    }
  } finally {
    result.requestBody = captured.request
    result.responseBody = captured.response
    result.durationMs = Date.now() - begin
  }
  sendJson(res, 200, result)
}

/// 探针错误码分类提示（对照契约 6.14 诊断表）
function classifyProbeError(code) {
  if (code === 20052) {
    return '验签失败：商户私钥与平台上配置的公钥不配对，或签名串构造不一致——比对「发出报文」与响应 msg 中的服务端待签串'
  }
  if (code === 10408 || code === 10409) {
    return 'Nonce 防重放拦截：请勿复用请求（每次点击都会生成新 nonce）'
  }
  if (code === 10410 || code === 10411) {
    return '请求时间超窗：本机时钟偏差过大，或 reqTime 未按 GMT+8 yyyy-MM-dd HH:mm:ss 字面量'
  }
  return '商户号/应用类错误（code ' + code + '）：核对 mchNo 与 appId 是否存在且启用'
}

// ==================================================================
// /demo/* 交易调试
// ==================================================================

/// 响应验签（demo 层独立复核，便于对照 SDK 内部验签行为）
///
/// 返回 null 表示响应不带签名——平台业务异常经全局异常处理器返回 Result 形状（无 sign），
/// 页面据此显示「未签名」而非「验签失败」。
function verifyResponse(responseBody, cfg) {
  if (!responseBody) {
    return null
  }
  try {
    const json = JSON.parse(responseBody)
    if (isBlank(json.sign)) {
      return null
    }
    return new NiuDunClient(cfg).verifyNotice(responseBody)
  } catch (e) {
    return false
  }
}

/// 从原始响应解析展示字段（业务失败时不抛异常，原样透出 code/msg）
function parseResult(responseBody) {
  if (!responseBody) {
    return null
  }
  try {
    return JSON.parse(responseBody)
  } catch (e) {
    return { parseError: responseBody }
  }
}

async function handleTrade(req, res, action) {
  const reqBody = await readBody(req)
  let paramJson = {}
  try {
    paramJson = JSON.parse(reqBody || '{}')
  } catch (e) {
    paramJson = {}
  }

  // 配置快照（一次读取，保证单次调用内一致）
  const cfg = currentConfig
  if (isBlank(cfg.privateKey)) {
    sendJson(res, 200, {
      success: false,
      requestBody: null,
      responseBody: null,
      durationMs: 0,
      signVerified: null,
      result: null,
      error: '尚未配置商户私钥，请点击右上角「连接配置」填写后重试',
    })
    return
  }

  const actionFn = ACTIONS[action]
  if (!actionFn) {
    sendJson(res, 404, { error: 'unknown action: ' + action })
    return
  }

  // observer 捕获本次调用的请求体/响应体（每次调用独立实例，无共享状态）
  const captured = { request: null, response: null }
  const client = new NiuDunClient(cfg).setObserver({
    onRequest: (signedJson) => {
      captured.request = signedJson
    },
    onResponse: (raw) => {
      captured.response = raw
    },
  })

  const begin = Date.now()
  let error = null
  try {
    await actionFn(client, paramJson)
  } catch (e) {
    // SDK 抛出（业务失败/验签失败/网络异常）也属联调有效结果，回显给页面
    error = String(e && e.message)
  }
  const durationMs = Date.now() - begin

  // 组装统一回显结构：SDK 实际发出的签名请求 + 平台原始响应 + 解析结果 + 验签
  sendJson(res, 200, {
    success: error === null,
    requestBody: captured.request,
    responseBody: captured.response,
    durationMs,
    signVerified: verifyResponse(captured.response, cfg),
    result: parseResult(captured.response),
    error,
  })
}

// ==================================================================
// /callback/* 异步通知接收
// ==================================================================

function handleCallback(res, type, body) {
  const cfg = currentConfig
  const record = { time: nowGmt8(), type, signVerified: false, code: null, msg: null, body }
  if (isBlank(cfg.publicKey)) {
    record.msg = '平台公钥未配置，无法验签（请在页面「连接配置」中补充）'
  } else {
    try {
      record.signVerified = new NiuDunClient(cfg).verifyNotice(body)
      const json = JSON.parse(body)
      record.code = typeof json.code === 'number' ? json.code : null
      record.msg = json.msg ?? null
    } catch (e) {
      record.signVerified = false
      record.msg = '解析失败: ' + (e && e.message)
    }
  }
  callbacks.unshift(record)
  while (callbacks.length > MAX_CALLBACKS) {
    callbacks.pop()
  }
  console.log('[回调] ' + record.time + ' ' + record.type + ' 验签=' + record.signVerified)
  // 平台要求 HTTP 2xx 且 body 等于 SUCCESS（忽略大小写）
  sendText(res, 200, 'SUCCESS')
}

// ==================================================================
// HTTP 分发
// ==================================================================

const server = createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname
  const method = req.method || 'GET'
  try {
    // 调试页
    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = await readFile(INDEX_HTML)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    // 连接配置：GET 读取脱敏状态 / POST 页面保存（配置存浏览器，服务端仅内存）
    if ((method === 'GET' || method === 'POST') && path === '/demo/config') {
      await handleConfig(req, res, method)
      return
    }
    // 回调记录（须在 /demo/* 交易路由之前匹配，避免被当作交易 action）
    if (method === 'GET' && path === '/demo/callbacks') {
      sendJson(res, 200, { count: callbacks.length, records: callbacks })
      return
    }
    if (method === 'POST' && path === '/demo/callbacks/clear') {
      callbacks.length = 0
      sendJson(res, 200, { ok: true })
      return
    }
    // 连通性自检：服务端代调平台探针（浏览器直连平台地址会跨域，故由本服务中转）
    if (method === 'POST' && path === '/demo/ping') {
      await handlePing(res)
      return
    }
    // 签名链路自检：服务端代调签名自检探针 POST /unipay/ping（「测试连接」第二段）
    if (method === 'POST' && path === '/demo/signed-ping') {
      await handleSignedPing(res)
      return
    }
    // 交易调试（经 SDK 真实调用链）
    if (method === 'POST' && path.startsWith('/demo/')) {
      await handleTrade(req, res, path.slice('/demo/'.length))
      return
    }
    // 平台异步通知接收端点（返回固定 SUCCESS，平台要求 HTTP 2xx 且 body 为 SUCCESS）
    if (method === 'POST' && (path === '/callback' || path.startsWith('/callback/'))) {
      const raw = path === '/callback' ? '' : path.slice('/callback/'.length)
      const type = decodeURIComponent(raw) || 'common'
      handleCallback(res, type, await readBody(req))
      return
    }
    sendJson(res, 404, { error: 'not found: ' + path })
  } catch (e) {
    try {
      sendJson(res, 500, { error: String(e && e.message) })
    } catch (ignored) {
      // 响应已提交，无法回写
    }
  }
})

server.listen(port, '127.0.0.1', () => {
  const cfg = currentConfig
  console.log('牛盾支付 Node.js SDK 联调 Demo 已启动')
  console.log('  调试页面 : http://127.0.0.1:' + port)
  console.log('  平台地址 : ' + cfg.serviceUrl + '  (商户 ' + (cfg.mchNo || '-') + ')')
  console.log(
    '  密钥状态 : 商户私钥 ' + (isBlank(cfg.privateKey) ? '未配置' : '已配置') +
      ' / 平台公钥 ' + (isBlank(cfg.publicKey) ? '未配置' : '已配置') +
      '  (可在页面「连接配置」中随时修改)',
  )
  console.log('  回调基址 : ' + callbackBase + '  (支付通知可填 ' + callbackBase + '/callback/pay)')
  console.log('配置文件非必做：请打开页面在「连接配置」中填写参数（保存在浏览器本地，不落盘）')
})
