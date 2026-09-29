import crypto from 'node:crypto'
import { type Config } from './config.js'
import { type NiuDunResult, type NiuDunObserver, type ExecuteOptions, NiuDunError, ErrorCode } from './types.js'
import type {
  AllocOrderResult,
  AllocParam,
  AllocQueryParam,
  AllocResult,
  AllocSyncParam,
  AllocSyncResult,
  CloseParam,
  GatewayOrderQueryParam,
  GatewayOrderResult,
  GatewayPrePayParam,
  GatewayPrePayResult,
  PayOrderResult,
  PayParam,
  PayQueryParam,
  PayResult,
  PaySyncParam,
  PaySyncResult,
  PingParam,
  PingResult,
  RefundOrderResult,
  RefundParam,
  RefundQueryParam,
  RefundResult,
  RefundSyncParam,
  RefundSyncResult,
  TransferOrderResult,
  TransferParam,
  TransferQueryParam,
  TransferResult,
  TransferSyncParam,
  TransferSyncResult,
} from './models.js'
import { buildSignStr } from './sign.js'
import { rsaSign, rsaVerify } from './rsa.js'

const DEFAULT_TIMEOUT = 30000

// 当前时间的 GMT+8 字面量（yyyy-MM-dd HH:mm:ss）— 对照后端 @JsonFormat(GMT+8)
function nowGmt8(): string {
  const beijing = new Date(Date.now() + 8 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())} ` +
    `${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}:${pad(beijing.getUTCSeconds())}`
  )
}

/// 牛盾支付 SDK 客户端 — 对照 sdk-contract.md 第十节
export class NiuDunClient {
  private readonly serviceUrl: string
  private readonly timeout: number

  /// 调用观测器（缺省 undefined，联调 demo 等场景挂载）
  private observer?: NiuDunObserver

  constructor(private readonly config: Config) {
    this.serviceUrl = config.serviceUrl.replace(/\/+$/, '')
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT
  }

  /// 设置调用观测器（拿到签名后请求体与原始响应体，联调排障用），返回 this 便于链式调用
  setObserver(observer: NiuDunObserver): this {
    this.observer = observer
    return this
  }

  /// 通用执行入口：自动填充公共参数 → JSON 签名 → POST → 验签 → 返回 NiuDunResult<T>
  /// 走 JSON 签名路径（reqTime 已序列化为 GMT+8 字面量），与后端验签一致
  ///
  /// options.throwOnBizError 为 false 时非 0 业务码不抛 [NiuDunError] 而是原样返回 NiuDunResult
  /// （签名自检探针的职责是报告检查结果，失败码/失败消息本身就是有效答案）；
  /// 响应验签失败仍抛异常（那是平台公钥配置问题，属于硬错误而非探针答案）。
  async execute<T = unknown>(path: string, param: object, options?: ExecuteOptions): Promise<NiuDunResult<T>> {
    const requestParam: Record<string, unknown> = { ...(param as Record<string, unknown>) }
    // 注入公共字段
    if (!requestParam.mchNo) requestParam.mchNo = this.config.mchNo
    if (!requestParam.appId && this.config.appId) requestParam.appId = this.config.appId
    if (!requestParam.reqId) requestParam.reqId = crypto.randomUUID()
    if (!requestParam.reqTime) requestParam.reqTime = nowGmt8()
    if (!requestParam.nonceStr) requestParam.nonceStr = crypto.randomBytes(16).toString('hex')

    // 走 JSON 签名路径：序列化 → 对 JSON 签名 → 注入 sign → 重新序列化发送
    const jsonForSign = JSON.stringify(requestParam)
    const signStr = buildSignStr(jsonForSign)
    requestParam.sign = rsaSign(signStr, this.config.privateKey)
    const body = JSON.stringify(requestParam)
    // 联调回显：签名后、发送前回调 observer（未设置 observer 时零开销）
    this.observer?.onRequest?.(body)

    const url = this.serviceUrl + path
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(this.timeout),
    })
    const rawBody = await res.text()
    if (!res.ok) {
      throw new NiuDunError(-1, `HTTP ${res.status}: ${rawBody}`)
    }
    // 联调回显：拿到平台原始响应文本后、验签**之前**回调（验签失败也能拿到原文）
    this.observer?.onResponse?.(rawBody)

    const result = JSON.parse(rawBody) as NiuDunResult<T> & { message?: string }
    // 验签策略：带 sign 的响应强制校验；无 sign 的成功响应视为来源不可信；无 sign 的失败响应直接透出业务码。
    // 平台业务异常经全局异常处理器返回 Result 形状（code/message，无 sign，data 为 null），
    // 若一并按"必验签"处理，业务错误会被误报为验签失败、真实错误码与消息全部丢失。
    const sign = typeof result.sign === 'string' ? result.sign.trim() : ''
    if (sign) {
      // 用原始 body 字符串验签（不可先反序列化再签名，会丢精度/格式）
      const verifyStr = buildSignStr(rawBody)
      if (!rsaVerify(verifyStr, result.sign as string, this.config.publicKey)) {
        throw new NiuDunError(ErrorCode.SignVerifyFailed, '响应验签失败')
      }
    } else if (result.code === 0) {
      // 成功响应必须带签名，否则来源不可信（防伪造成功响应）
      throw new NiuDunError(ErrorCode.SignVerifyFailed, '响应缺少签名，无法验证来源')
    }
    // 消息读取兼容：平台异常响应的消息字段是 message（NiuDunResult 为 msg），msg 为空时回退读取
    if (!result.msg) result.msg = result.message ?? ''
    // 业务码检查：非 0 抛 NiuDunError；探针路径（throwOnBizError=false）不抛而是原样返回 NiuDunResult，
    // 失败码/失败消息本身就是探针的有效答案（非 0 码时 data 必为 null）
    if (result.code !== 0 && options?.throwOnBizError !== false) {
      throw new NiuDunError(result.code, `[${result.code}] ${result.msg}`)
    }
    return result
  }

  /// 支付下单便捷方法 — POST /unipay/pay
  async pay(param: PayParam): Promise<NiuDunResult<PayResult>> {
    return this.execute<PayResult>('/unipay/pay', param)
  }

  /// 关闭/撤销订单便捷方法 — POST /unipay/close（响应 data 为 null，凭 code === 0 判断成功）
  async close(param: CloseParam): Promise<NiuDunResult<null>> {
    return this.execute<null>('/unipay/close', param)
  }

  /// 查询支付订单便捷方法 — POST /unipay/query/pay-order
  async queryPayOrder(param: PayQueryParam): Promise<NiuDunResult<PayOrderResult>> {
    return this.execute<PayOrderResult>('/unipay/query/pay-order', param)
  }

  /// 支付订单同步 — POST /unipay/sync/order/pay（主动拉通道最新状态并回写本地，回调丢失的兜底补偿）
  async syncPayOrder(param: PaySyncParam): Promise<NiuDunResult<PaySyncResult>> {
    return this.execute<PaySyncResult>('/unipay/sync/order/pay', param)
  }

  /// 退款便捷方法 — POST /unipay/refund
  async refund(param: RefundParam): Promise<NiuDunResult<RefundResult>> {
    return this.execute<RefundResult>('/unipay/refund', param)
  }

  /// 查询退款订单便捷方法 — POST /unipay/query/refund-order（仅查本地单，不调通道）
  async queryRefundOrder(param: RefundQueryParam): Promise<NiuDunResult<RefundOrderResult>> {
    return this.execute<RefundOrderResult>('/unipay/query/refund-order', param)
  }

  /// 退款订单同步 — POST /unipay/sync/order/refund
  async syncRefundOrder(param: RefundSyncParam): Promise<NiuDunResult<RefundSyncResult>> {
    return this.execute<RefundSyncResult>('/unipay/sync/order/refund', param)
  }

  /// 转账便捷方法 — POST /unipay/transfer（通道直连转账，幂等维度：通道+商户转账号+商户号）
  async transfer(param: TransferParam): Promise<NiuDunResult<TransferResult>> {
    return this.execute<TransferResult>('/unipay/transfer', param)
  }

  /// 查询转账订单便捷方法 — POST /unipay/query/transfer-order（仅查本地单，不调通道）
  async queryTransferOrder(param: TransferQueryParam): Promise<NiuDunResult<TransferOrderResult>> {
    return this.execute<TransferOrderResult>('/unipay/query/transfer-order', param)
  }

  /// 转账订单同步 — POST /unipay/sync/order/transfer
  async syncTransferOrder(param: TransferSyncParam): Promise<NiuDunResult<TransferSyncResult>> {
    return this.execute<TransferSyncResult>('/unipay/sync/order/transfer', param)
  }

  /// 分账便捷方法 — POST /unipay/alloc（原支付单须下单时声明 allocation=true）
  async alloc(param: AllocParam): Promise<NiuDunResult<AllocResult>> {
    return this.execute<AllocResult>('/unipay/alloc', param)
  }

  /// 查询分账订单便捷方法 — POST /unipay/query/alloc-order（仅查本地单，不调通道）
  async queryAllocOrder(param: AllocQueryParam): Promise<NiuDunResult<AllocOrderResult>> {
    return this.execute<AllocOrderResult>('/unipay/query/alloc-order', param)
  }

  /// 分账订单同步 — POST /unipay/sync/order/alloc
  async syncAllocOrder(param: AllocSyncParam): Promise<NiuDunResult<AllocSyncResult>> {
    return this.execute<AllocSyncResult>('/unipay/sync/order/alloc', param)
  }

  /// 网关预下单 — POST /unipay/gateway/pre-pay（返回收银台跳转地址 h5Url/miniUrl）
  async gatewayPrePay(param: GatewayPrePayParam): Promise<NiuDunResult<GatewayPrePayResult>> {
    return this.execute<GatewayPrePayResult>('/unipay/gateway/pre-pay', param)
  }

  /// 网关订单查询 — POST /unipay/gateway/query
  async gatewayQuery(param: GatewayOrderQueryParam): Promise<NiuDunResult<GatewayOrderResult>> {
    return this.execute<GatewayOrderResult>('/unipay/gateway/query', param)
  }

  /// 签名自检探针 — POST /unipay/ping（走完整验签链路，一键判定商户号/应用/私钥/签名串是否可用）
  ///
  /// 与免签名 [ping] 互补：本方法由持商户私钥方发起，非 0 业务码不抛异常而是原样返回，
  /// 供调用方按 code 分类诊断（20052=验签失败且 msg 含服务端待签串；10408-10411=nonce/时钟；
  /// 其余=商户号/应用类）；响应验签失败仍抛异常（平台公钥配置问题）。
  async signedPing(param: PingParam): Promise<NiuDunResult<PingResult>> {
    return this.execute<PingResult>('/unipay/ping', param, { throwOnBizError: false })
  }

  /// 回调链路自检探针 — GET /unipay/callback/ping（免签名免登录，返回固定标识文本）
  ///
  /// 用于部署自检：探针可达即代表「通道回调」接口组已放行、后端地址配置正确。
  async ping(): Promise<string> {
    const res = await fetch(this.serviceUrl + '/unipay/callback/ping', {
      method: 'GET',
      signal: AbortSignal.timeout(this.timeout),
    })
    const rawBody = await res.text()
    if (!res.ok) {
      throw new NiuDunError(-1, `探针请求失败: HTTP ${res.status}`)
    }
    return rawBody
  }

  /// 回调验签（原始 HTTP body 字符串）— 对照契约第八节
  verifyNotice(rawBody: string): boolean {
    let obj: { sign?: string }
    try {
      obj = JSON.parse(rawBody)
    } catch {
      return false
    }
    if (!obj.sign) return false
    const signStr = buildSignStr(rawBody)
    return rsaVerify(signStr, obj.sign, this.config.publicKey)
  }
}
