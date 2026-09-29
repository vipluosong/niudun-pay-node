/// 开放接口业务模型（15 个业务接口 + 签名自检探针）— 对照 sdk-contract.md 第六节
///
/// 约定：金额一律为「分」（整数）；时间字段为 GMT+8 字面量 `yyyy-MM-dd HH:mm:ss`
/// （契约接口出参不做时区转换，由调用方按需展示）。公共字段（mchNo/appId/reqId/...）
/// 由 [NiuDunClient] 注入，见 [CommonParam]。
import type { CommonParam } from './types.js'

// ==================================================================
// 共享嵌套类型（契约 6.6 / 6.7 / 6.8 / 6.9）
// ==================================================================

/// 终端信息（线下 POS / 收银台场景）
export interface TerminalInfo {
  /** 终端设备号 */
  terminalNo?: string
  /** 门店编号 */
  storeNo?: string
  /** 操作员号 */
  operatorId?: string
  /** 设备名称 */
  deviceName?: string
  /** 设备 IP 地址 */
  deviceIp?: string
  /** 经度 */
  longitude?: number
  /** 纬度 */
  latitude?: number
}

/// 订单商品明细（单个，PayParam 与 GatewayPrePayParam 共用）
export interface GoodsDetail {
  /** 商户侧商品编码（必填） */
  goodsId: string
  /** 商品名称（必填） */
  goodsName: string
  /** 商品数量（必填，≥1） */
  quantity: number
  /** 商品单价，分（必填） */
  unitPrice: number
  /** 商品分类（支付宝独有） */
  category?: string
  /** 商品描述 */
  description?: string
  /** 商品展示链接 */
  showUrl?: string
}

/// 转账场景报备信息（单个，TransferParam.reportInfos）
///
/// 微信转账场景报备，字段含义由通道场景定义决定（如 1000 现金营销场景需报备活动名称）。
export interface ReportInfo {
  /** 报备信息类型 */
  infoType?: string
  /** 报备信息内容 */
  infoContent?: string
}

/// 分账接收方（单个，AllocParam.receivers）
///
/// 接收方类型取值见平台 AllocReceiverTypeEnum：MERCHANT_ID（商户号）/
/// PERSONAL_OPENID（个人 openid）/ PERSONAL_SUB_OPENID（子商户 openid）/
/// USER_ID（支付宝用户 ID）/ LOGIN_NAME（支付宝登录号）。
export interface AllocReceiver {
  /** 接收方类型（必填） */
  receiverType: string
  /** 接收方账号（必填） */
  receiverAccount: string
  /** 接收方姓名（部分通道/类型必填） */
  receiverName?: string
  /** 分账金额，分（必填，≥1） */
  amount: number
}

/// 分账接收方明细（结果侧，单个，AllocOrderResult.details）
export interface AllocDetail {
  /** 接收方类型 */
  receiverType?: string
  /** 接收方账号 */
  receiverAccount?: string
  /** 接收方姓名 */
  receiverName?: string
  /** 分账金额，分 */
  amount?: number
  /** 该接收方分账结果 */
  result?: string
  /** 错误信息 */
  errorMsg?: string
  /** 完成时间（北京时间字面量） */
  finishTime?: string
}

// ==================================================================
// 支付族（契约 6.1 / 6.2 / 6.4 / 6.11）
// ==================================================================

/// 支付下单请求参数
export interface PayParam extends CommonParam {
  /** 商户订单号（必填，商户侧唯一，≤100） */
  bizOrderNo: string
  /** 支付标题（必填，≤100） */
  title: string
  /** 支付描述（≤50） */
  description?: string
  /** 支付金额，分（必填，1 ≤ x ≤ 9999999999） */
  amount: number
  /** 币种 ISO 4217，缺省 cny */
  currency?: string
  /** 支付产品编码（空则通道路由自动选择） */
  product?: string
  /** 支付方式编码（路由模式一般必填；被扫可空；见 PayMethodEnum） */
  method?: string
  /** 支付能力编码 */
  capability?: string
  /** 用户 OpenId（微信 jsapi/mini 场景必填） */
  openId?: string
  /** 通道应用 AppId（微信 wxAppId 等） */
  channelAppId?: string
  /** 付款码（被扫支付必填） */
  authCode?: string
  /** 限制支付类型，如 ["no_credit"] */
  limitPay?: string[]
  /** 支付扩展参数（JSON 字符串，通道特有长尾参数） */
  extraParam?: string
  /** 订单商品明细（用于单品营销/电子发票） */
  goodsDetail?: GoodsDetail[]
  /** 异步通知地址（≤200） */
  notifyUrl?: string
  /** 同步跳转地址（≤200） */
  returnUrl?: string
  /** 商户扩展参数，回调原样返回（≤500） */
  attach?: string
  /** 过期时间（GMT+8 yyyy-MM-dd HH:mm:ss，空默认 30 分钟） */
  expiredTime?: string
  /** 终端信息（线下 POS/收银台场景） */
  terminal?: TerminalInfo
  /** 订单来源标识 */
  source?: string
  /** 是否为分账订单（分账链路前置条件：下单未声明则通道拒绝后续分账） */
  allocation?: boolean
}

/// 支付下单响应结果
export interface PayResult {
  /** 商户订单号 */
  bizOrderNo?: string
  /** 平台业务单号 */
  orderNo?: string
  /** 资金交易号（与 orderNo 独立） */
  tradeNo?: string
  /** 支付状态（资金态）：init/processing/success/fail/close/cancel */
  status?: string
  /** 支付参数体（二维码链接/调起参数/跳转 URL） */
  payBody?: string
  /** 支付参数体类型：code_url/pay_info/redirect_url */
  payBodyType?: string
}

/// 关闭/撤销订单请求参数
///
/// orderNo 与 bizOrderNo 至少传一个，优先 orderNo；响应 data 为 null，凭 code === 0 判断成功。
export interface CloseParam extends CommonParam {
  /** 平台支付订单号(tradeNo)或网关订单号（优先） */
  orderNo?: string
  /** 商户订单号 */
  bizOrderNo?: string
  /** 是否使用撤销方式（部分通道支持，不支持则忽略） */
  useCancel?: boolean
}

/// 查询支付订单请求参数（orderNo 与 bizOrderNo 至少一个，优先 orderNo）
export interface PayQueryParam extends CommonParam {
  /** 平台业务单号（优先） */
  orderNo?: string
  /** 商户订单号 */
  bizOrderNo?: string
}

/// 支付订单查询结果
export interface PayOrderResult {
  /** 商户订单号 */
  bizOrderNo?: string
  /** 平台业务单号 */
  orderNo?: string
  /** 资金交易号 */
  tradeNo?: string
  /** 通道系统交易号 */
  outOrderNo?: string
  /** 支付标题 */
  title?: string
  /** 支付描述 */
  description?: string
  /** 支付通道 */
  channel?: string
  /** 支付方式 */
  method?: string
  /** 限制用户支付类型 */
  limitPay?: string
  /** 金额，分 */
  amount?: number
  /** 币种 ISO 4217（如 cny/usd，缺省 cny） */
  currency?: string
  /** 实收金额，分 */
  realAmount?: number
  /** 可退款余额，分 */
  refundableBalance?: number
  /** 支付状态 */
  status?: string
  /** 退款状态 */
  refundStatus?: string
  /** 支付渠道（微信/支付宝/银联） */
  provider?: string
  /** 支付时间（北京时间字面量） */
  payTime?: string
  /** 关闭时间（北京时间字面量） */
  closeTime?: string
  /** 过期时间（北京时间字面量） */
  expiredTime?: string
  /** 终端设备编码 */
  terminalNo?: string
  /** 门店号 */
  storeNo?: string
  /** 付款用户 ID */
  buyerId?: string
  /** 商户扩展参数（原样返回） */
  attach?: string
  /** 错误信息 */
  errorMsg?: string
}

/// 支付订单同步参数
///
/// 主动向通道拉取支付单最新状态并回写本地（用于回调丢失的兜底补偿）。
/// orderNo / bizOrderNo / outOrderNo 至少传一个。
export interface PaySyncParam extends CommonParam {
  /** 平台业务单号 */
  orderNo?: string
  /** 商户订单号 */
  bizOrderNo?: string
  /** 通道系统交易号 */
  outOrderNo?: string
}

/// 支付订单同步结果（四个同步接口形状统一）
export interface PaySyncResult {
  /** 同步后的支付订单状态 */
  orderStatus?: string
  /** 本次同步是否订正了本地状态（true=本地状态被通道结果修正） */
  adjust?: boolean
}

// ==================================================================
// 退款族（契约 6.3 / 6.5 / 6.11）
// ==================================================================

/// 退款请求参数（tradeNo 与 bizOrderNo 至少传一个，优先 tradeNo）
export interface RefundParam extends CommonParam {
  /** 原支付资金交易号（优先） */
  tradeNo?: string
  /** 原支付商户业务订单号 */
  bizOrderNo?: string
  /** 退款金额，分（必填，>0，支持部分退款） */
  amount: number
  /** 退款原因（≤50） */
  reason?: string
  /** 商户退款号（不传则系统生成） */
  bizRefundNo?: string
}

/// 退款响应结果
export interface RefundResult {
  /** 平台退款号 */
  refundNo?: string
  /** 商户退款号 */
  bizRefundNo?: string
  /** 退款状态 */
  status?: string
  /** 错误信息（失败时返回） */
  errorMsg?: string
}

/// 查询退款订单请求参数（refundNo 与 bizRefundNo 至少一个，优先 refundNo）
export interface RefundQueryParam extends CommonParam {
  /** 平台退款号（优先） */
  refundNo?: string
  /** 商户退款号 */
  bizRefundNo?: string
}

/// 退款订单查询结果（仅查本地单，不调通道）
export interface RefundOrderResult {
  /** 平台退款号 */
  refundNo?: string
  /** 商户退款号 */
  bizRefundNo?: string
  /** 原支付资金交易号 */
  tradeNo?: string
  /** 原支付商户业务订单号 */
  bizOrderNo?: string
  /** 通道退款流水号 */
  outRefundNo?: string
  /** 退款金额，分 */
  amount?: number
  /** 订单总金额，分 */
  orderAmount?: number
  /** 退款状态 */
  status?: string
  /** 退款原因 */
  reason?: string
  /** 退款完成时间（北京时间字面量） */
  finishTime?: string
  /** 错误信息 */
  errorMsg?: string
}

/// 退款订单同步参数（refundNo 与 bizRefundNo 至少传一个，优先 refundNo）
export interface RefundSyncParam extends CommonParam {
  /** 平台退款号（优先） */
  refundNo?: string
  /** 商户退款号 */
  bizRefundNo?: string
}

/// 退款订单同步结果
export interface RefundSyncResult {
  /** 同步后的退款订单状态 */
  orderStatus?: string
  /** 本次同步是否订正了本地状态 */
  adjust?: boolean
}

// ==================================================================
// 转账族（契约 6.7 / 6.10 / 6.11）
// ==================================================================

/// 转账请求参数
///
/// 按通道直连发起转账（商户转账到余额/银行卡/OpenId 等）。
/// 幂等维度为 通道 + 商户转账号 + 商户号：同组合重复发起会拦截，失败单可复用原单号重试。
/// 金额单位为「分」，公共字段由 [NiuDunClient] 注入。
export interface TransferParam extends CommonParam {
  /** 转账通道（wechat/alipay/douyin，必填） */
  channel: string
  /** 通道商户号（转账凭证组装与通道路由用，必填） */
  channelMchNo: string
  /** 商户转账号（幂等键，同一商户同一通道下唯一；失败后可复用原单号重试） */
  bizTransferNo: string
  /** 转账金额，分（必填） */
  amount: number
  /** 转账标题 */
  title?: string
  /** 转账原因/备注（≤200） */
  reason?: string
  /** 收款人账号类型（微信=openid；支付宝=user_id/open_id/login_name；抖音=openid/phone） */
  payeeType: string
  /** 收款人账号 */
  payeeAccount: string
  /** 收款人姓名（微信：小于 0.3 元禁填，大于等于 2000 元必填） */
  payeeName?: string
  /** 商户扩展参数，回调原样返回 */
  attach?: string
  /** 异步通知地址 */
  notifyUrl?: string
  /** 转账场景报备信息（微信转账场景必填，各场景要求不同，留空由通道兜底） */
  reportInfos?: ReportInfo[]
  /** 转账场景标识（支付宝=转账场景配置 ID，抖音=主数据枚举码如 1001；微信不传，用通道商户配置场景） */
  transferScene?: string
}

/// 转账响应结果
export interface TransferResult {
  /** 平台转账单号 */
  transferNo?: string
  /** 商户转账号 */
  bizTransferNo?: string
  /** 转账状态 */
  status?: string
  /** 确认收款跳转地址（部分通道需收款人确认收款） */
  confirmUrl?: string
}

/// 转账订单查询参数
///
/// 定位方式二选一：平台转账单号（transferNo）单独可查；商户转账号（bizTransferNo）
/// 须配转账通道（channel），与发起幂等维度保持一致。仅查询本地转账单，不调用通道。
export interface TransferQueryParam extends CommonParam {
  /** 平台转账单号（优先） */
  transferNo?: string
  /** 转账通道（与商户转账号配对使用） */
  channel?: string
  /** 商户转账号（与转账通道配对使用） */
  bizTransferNo?: string
}

/// 转账订单查询结果
export interface TransferOrderResult {
  /** 平台转账单号 */
  transferNo?: string
  /** 商户转账号 */
  bizTransferNo?: string
  /** 通道转账单号 */
  outTransferNo?: string
  /** 关联单号（如转账来源业务单号） */
  relationNo?: string
  /** 转账金额，分 */
  amount?: number
  /** 币种 ISO 4217 */
  currency?: string
  /** 转账通道 */
  channel?: string
  /** 支付渠道（微信/支付宝/抖音） */
  provider?: string
  /** 转账状态 */
  status?: string
  /** 转账标题 */
  title?: string
  /** 转账完成时间（北京时间字面量） */
  finishTime?: string
  /** 错误信息 */
  errorMsg?: string
}

/// 转账订单同步参数（transferNo 单独可查；bizTransferNo 须配 channel）
export interface TransferSyncParam extends CommonParam {
  /** 平台转账单号（优先） */
  transferNo?: string
  /** 转账通道（与商户转账号配对使用） */
  channel?: string
  /** 商户转账号（与转账通道配对使用） */
  bizTransferNo?: string
}

/// 转账订单同步结果
export interface TransferSyncResult {
  /** 同步后的转账订单状态 */
  orderStatus?: string
  /** 本次同步是否订正了本地状态 */
  adjust?: boolean
}

// ==================================================================
// 分账族（契约 6.8 / 6.9 / 6.11）
// ==================================================================

/// 分账请求参数
///
/// 原支付订单须在**下单时声明** allocation=true（分账订单），否则通道拒绝分账。
/// 接收方列表直接传入完整明细（极简模式，接收方绑定由调用方提前在通道侧完成）。
export interface AllocParam extends CommonParam {
  /** 商户分账单号（幂等键，同一应用下唯一，必填，≤100） */
  bizAllocNo: string
  /** 原支付资金交易号（与 bizOrderNo 二选一，优先本字段） */
  tradeNo?: string
  /** 原支付商户业务订单号 */
  bizOrderNo?: string
  /** 分账标题 */
  title?: string
  /** 分账描述（≤500） */
  description?: string
  /** 接收方列表（至少一个，必填） */
  receivers: AllocReceiver[]
  /** 商户扩展参数，回调时原样返回 */
  attach?: string
  /** 异步通知地址 */
  notifyUrl?: string
}

/// 分账响应结果
export interface AllocResult {
  /** 平台分账单号 */
  allocNo?: string
  /** 商户分账单号 */
  bizAllocNo?: string
  /** 分账状态 */
  status?: string
  /** 错误信息（失败时返回） */
  errorMsg?: string
}

/// 分账订单查询参数（allocNo 与 bizAllocNo 至少传一个，优先 allocNo）
export interface AllocQueryParam extends CommonParam {
  /** 平台分账单号（优先） */
  allocNo?: string
  /** 商户分账单号 */
  bizAllocNo?: string
}

/// 分账订单查询结果（仅查本地单，不调通道）
export interface AllocOrderResult {
  /** 平台分账单号 */
  allocNo?: string
  /** 商户分账单号 */
  bizAllocNo?: string
  /** 原支付资金交易号 */
  tradeNo?: string
  /** 商户业务订单号 */
  bizOrderNo?: string
  /** 通道分账单号 */
  outAllocNo?: string
  /** 分账总金额，分 */
  amount?: number
  /** 分账状态 */
  status?: string
  /** 分账完成时间（北京时间字面量） */
  finishTime?: string
  /** 支付通道 */
  channel?: string
  /** 商户扩展参数（原样返回） */
  attach?: string
  /** 错误信息 */
  errorMsg?: string
  /** 分账接收方明细列表 */
  details?: AllocDetail[]
}

/// 分账订单同步参数（allocNo 与 bizAllocNo 至少传一个，优先 allocNo）
export interface AllocSyncParam extends CommonParam {
  /** 平台分账单号（优先） */
  allocNo?: string
  /** 商户分账单号 */
  bizAllocNo?: string
}

/// 分账订单同步结果
export interface AllocSyncResult {
  /** 同步后的分账订单状态 */
  orderStatus?: string
  /** 本次同步是否订正了本地状态 */
  adjust?: boolean
}

// ==================================================================
// 网关族（契约 6.12 / 6.13）
// ==================================================================

/// 网关预下单参数
///
/// 产品语义「网关支付」：由平台收银台承接支付项选择与调起，商户侧只需拿到跳转地址（h5Url / miniUrl）。
export interface GatewayPrePayParam extends CommonParam {
  /** 商户订单号（必填，≤100） */
  bizOrderNo: string
  /** 支付标题（必填，≤100） */
  title: string
  /** 支付描述 */
  description?: string
  /** 支付金额，分（必填） */
  amount: number
  /** 币种 ISO 4217，缺省 cny */
  currency?: string
  /** 网关支付类型：cashier（统一收银台）/ aggregate（聚合扫码一码多付） */
  gatewayPayType?: string
  /** 异步通知地址 */
  notifyUrl?: string
  /** 同步跳转地址 */
  returnUrl?: string
  /** 商户扩展参数，回调原样返回 */
  attach?: string
  /** 支付扩展参数（JSON 字符串，通道特有长尾参数） */
  extraParam?: string
  /** 过期时间（GMT+8 yyyy-MM-dd HH:mm:ss） */
  expiredTime?: string
  /** 门店编号 */
  storeNo?: string
  /** 订单商品明细（用于单品营销/电子发票） */
  goodsDetail?: GoodsDetail[]
  /** 是否为分账订单（分账链路前置条件） */
  allocation?: boolean
}

/// 网关预下单结果（商户侧拿到跳转地址后引导用户进入平台收银台/聚合码页）
export interface GatewayPrePayResult {
  /** 平台网关单号 */
  orderNo?: string
  /** 商户订单号 */
  bizOrderNo?: string
  /** 订单状态 */
  status?: string
  /** 网关支付类型（cashier/aggregate） */
  gatewayType?: string
  /** H5 收银台跳转地址 */
  h5Url?: string
  /** 小程序收银台跳转地址 */
  miniUrl?: string
  /** 过期时间（北京时间字面量） */
  expiredTime?: string
}

/// 网关订单查询参数
///
/// 与其它接口不同，本参数对应平台侧继承**平台公共参数**（非商户公共参数）：
/// mchNo / appId 是参数自身的可选字段，用于网关侧按应用定位订单（缺省时由 SDK 注入默认值）。
export interface GatewayOrderQueryParam {
  /** 平台网关单号 */
  orderNo?: string
  /** 商户业务单号 */
  bizOrderNo?: string
  /** 应用号 */
  appId?: string
  /** 商户号 */
  mchNo?: string
}

/// 网关订单查询结果（时间字段为北京时间字面量）
export interface GatewayOrderResult {
  /** 平台网关单号 */
  orderNo?: string
  /** 商户业务单号 */
  bizOrderNo?: string
  /** 网关支付类型（cashier/aggregate） */
  gatewayType?: string
  /** 支付标题 */
  title?: string
  /** 支付描述 */
  description?: string
  /** 金额，分 */
  amount?: number
  /** 币种 ISO 4217 */
  currency?: string
  /** 订单状态 */
  status?: string
  /** 过期时间（北京时间字面量） */
  expiredTime?: string
  /** 支付时间（北京时间字面量） */
  payTime?: string
  /** 支付通道 */
  channel?: string
  /** 支付方式 */
  method?: string
  /** 支付产品编码 */
  product?: string
  /** 资金交易号 */
  tradeNo?: string
  /** 通道系统交易号 */
  outOrderNo?: string
  /** 资金状态 */
  fundStatus?: string
  /** 商户扩展参数（原样返回） */
  attach?: string
  /** 同步跳转地址 */
  returnUrl?: string
}

// ==================================================================
// 自检族（契约 6.14）
// ==================================================================

/// 签名自检探针请求参数
///
/// 对照契约 6.14 节：仅公共参数（mchNo/appId/reqId/reqTime/nonceStr/sign），无业务字段，
/// 公共字段由 [NiuDunClient] 注入。
export interface PingParam {}

/// 签名自检探针结果
///
/// 对照契约 6.14 节：回显平台侧解析结果，供对接方核对商户身份与签名串构造。
export interface PingResult {
  /** 商户号 */
  mchNo?: string
  /** 应用号 */
  appId?: string
  /** 是否回落平台默认应用 */
  appFromDefault?: boolean
  /** 服务端待签串（验签失败时与本地构造串逐字段比对定位差异） */
  serverSignStr?: string
}
