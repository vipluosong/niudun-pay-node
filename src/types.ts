/// 统一响应 NiuDunResult 与公共类型 — 对照 sdk-contract.md 第五节

/// 统一响应结构
export interface NiuDunResult<T = unknown> {
  /** 业务状态码，0 成功，非 0 失败 */
  code: number
  /** 提示信息（注意是 msg 非 message） */
  msg: string
  /** 业务数据，失败时通常 null */
  data: T | null
  /** 平台 RSA 响应签名（Base64）；平台业务异常响应不带此字段 */
  sign?: string
  /** 响应时间（北京时间 yyyy-MM-dd HH:mm:ss） */
  resTime?: string
  /** 请求 ID 回显 */
  reqId?: string
  /**
   * 平台业务异常响应的消息字段（平台侧全局异常处理器返回的 Result 形状用 message 而非 msg，
   * 且不带 sign）。SDK 在 msg 为空时回退读此字段，仅供兼容层使用。
   */
  message?: string
}

/// 调用观测器（联调/排障场景挂载）
///
/// 挂在 [NiuDunClient#setObserver] 上可拿到每次调用
/// 「签名后的完整请求体」与「平台原始响应体」，便于与后端日志逐字对照。
/// 不设置则零开销，不影响正常调用链。
export interface NiuDunObserver {
  /** 请求已签名待发出（signedJson 为含 sign 字段的完整请求 JSON） */
  onRequest?: (signedJson: string) => void
  /** 收到平台原始响应体（在响应验签**之前**回调，验签失败时也可拿到原文） */
  onResponse?: (rawBody: string) => void
}

/// [NiuDunClient#execute] 的可选行为开关
export interface ExecuteOptions {
  /**
   * 非 0 业务码是否抛 [NiuDunError]（默认 true）。
   * 签名自检探针等诊断类调用置 false：失败码/失败消息本身就是探针的有效答案，
   * 非 0 码原样返回 NiuDunResult 供调用方按 code 分类诊断；
   * 响应验签失败不受此开关影响，仍会抛出（平台公钥配置问题属硬错误）。
   */
  throwOnBizError?: boolean
}

/// 公共请求参数（所有业务请求继承，对照契约第四节）
export interface CommonParam {
  mchNo?: string
  appId?: string
  reqId?: string
  /** 请求时间（SDK 自动生成，GMT+8 yyyy-MM-dd HH:mm:ss 字面量） */
  reqTime?: string
  nonceStr?: string
  clientIp?: string
  sign?: string
}

/// 业务异常（code !== 0 时抛出）
export class NiuDunError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message)
    this.name = 'NiuDunError'
  }
}

/// 常用错误码（对照契约第九节）
export const ErrorCode = {
  Success: 0,
  Fail: 1,
  AuthFail: 10401,
  NonceMissing: 10408,
  NonceInvalid: 10409,
  TimestampExpired: 10410,
  ParamParseError: 10505,
  ParamValidationError: 10506,
  TradeNotExist: 20041,
  TradeClosed: 20042,
  TradeProcessing: 20043,
  TradeStatusError: 20044,
  SignVerifyFailed: 20052,
  SystemUnknown: 30000,
} as const
