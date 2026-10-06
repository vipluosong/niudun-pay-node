/// SDK 配置 — 对照 sdk-contract.md 第十节
export interface Config {
  /** 网关地址（自动去尾斜杠），如 https://ndpay-api.qyyapp.com */
  serviceUrl: string
  /** 商户号 */
  mchNo: string
  /** 应用号（可选，空回落默认应用） */
  appId?: string
  /** 商户私钥 PEM（PKCS#8，-----BEGIN PRIVATE KEY-----） */
  privateKey: string
  /** 平台公钥 PEM（X.509，-----BEGIN PUBLIC KEY-----） */
  publicKey: string
  /** 请求超时毫秒，默认 30000 */
  timeout?: number
}
