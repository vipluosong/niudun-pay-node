import crypto from 'node:crypto'

// 密钥文本容错归一。
//
// 从网页、聊天窗口、PDF、IDE 复制 PEM 时，正文换行常被替换成空格或不换行空格（NBSP），
// 或整段压成一行、混入零宽字符，甚至只剩裸 Base64。Node 的 PEM 解析走 OpenSSL，
// 要求 BEGIN / END 行结构完整，遇到上述形态会直接报 `DECODER routines::unsupported`。
// 这里在标准解析失败后做一次归一：剥掉头尾标记、剔除全部空白与不可见字符，
// 再按 Base64（含无填充变体）解出 DER，交给上层按 SPKI / PKCS#1 解析。

/// 零宽字符与软连字符；JS 的 \s 已覆盖 NBSP(U+00A0) 与 BOM(U+FEFF)，但不含 NEL(U+0085)
const INVISIBLE_RE = /[\s\u0085\u200b-\u200d\u2060\u00ad]/g

/// 剥掉 -----BEGIN xxx----- / -----END xxx----- 标记，返回中间内容
function stripArmor(text: string): string {
  let body = text
  const begin = body.indexOf('-----BEGIN')
  if (begin >= 0) {
    body = body.slice(begin + '-----BEGIN'.length)
    // 跳过 " xxx-----" 到起始标记结束
    const close = body.indexOf('-----')
    if (close >= 0) body = body.slice(close + '-----'.length)
  }
  const end = body.indexOf('-----END')
  if (end >= 0) body = body.slice(0, end)
  return body
}

/// 按 Base64 解出 DER；非法返回 null
/// Node 自带解码器会静默吞掉非法字符，这里做严格校验 + 回编码比对
function decodeBase64(body: string): Buffer | null {
  const unpadded = body.replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]+$/.test(unpadded) || unpadded.length % 4 === 1) return null
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4)
  const der = Buffer.from(padded, 'base64')
  return der.toString('base64') === padded ? der : null
}

/// 从任意形态的密钥文本中提取 DER
function toDER(text: string, label: string): Buffer {
  if (!text || text.trim() === '') throw new Error(`${label}内容为空`)
  const body = stripArmor(text).replace(INVISIBLE_RE, '')
  if (body === '') {
    throw new Error('未找到密钥内容，请确认已完整复制 PEM（含 BEGIN / END 两行）')
  }
  const der = decodeBase64(body)
  if (!der) {
    throw new Error('密钥内容不是合法的 Base64，请确认复制完整且未混入其它字符')
  }
  return der
}

/// 加载商户私钥（PKCS#8 优先，回退 PKCS#1）→ KeyObject
/// 文本先经容错归一，兼容换行丢失 / 混入不可见字符的粘贴形态
export function loadPrivateKey(pem: string): crypto.KeyObject {
  try {
    return crypto.createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' })
  } catch {
    // 落到容错归一
  }
  const der = toDER(pem, '私钥')
  for (const type of ['pkcs8', 'pkcs1'] as const) {
    try {
      return crypto.createPrivateKey({ key: der, format: 'der', type })
    } catch {
      // 继续试下一种编码
    }
  }
  throw new Error(
    '私钥解析失败：需为 PKCS#8（-----BEGIN PRIVATE KEY-----）或 PKCS#1（-----BEGIN RSA PRIVATE KEY-----）格式的 RSA 私钥',
  )
}

/// 加载平台公钥（X.509 优先，回退 PKCS#1）→ KeyObject
/// 文本先经容错归一，兼容换行丢失 / 混入不可见字符的粘贴形态
export function loadPublicKey(pem: string): crypto.KeyObject {
  try {
    return crypto.createPublicKey({ key: pem, format: 'pem', type: 'spki' })
  } catch {
    // 落到容错归一
  }
  const der = toDER(pem, '公钥')
  for (const type of ['spki', 'pkcs1'] as const) {
    try {
      return crypto.createPublicKey({ key: der, format: 'der', type })
    } catch {
      // 继续试下一种编码
    }
  }
  throw new Error(
    '公钥解析失败：需为 X.509（-----BEGIN PUBLIC KEY-----）或 PKCS#1（-----BEGIN RSA PUBLIC KEY-----）格式的 RSA 公钥',
  )
}

/// 校验商户私钥是否可解析（联调页保存配置时即时反馈）；失败抛带原因的异常
export function validatePrivateKeyPEM(pem: string): void {
  loadPrivateKey(pem)
}

/// 校验平台公钥是否可解析（联调页保存配置时即时反馈）；失败抛带原因的异常
export function validatePublicKeyPEM(pem: string): void {
  loadPublicKey(pem)
}

/// RSA 签名（SHA256withRSA，UTF-8，Base64 输出）— 对照后端 RsaSignUtil#sign
export function rsaSign(data: string, privateKeyPem: string): string {
  const signer = crypto.createSign('SHA256')
  signer.update(data, 'utf8')
  return signer.sign(loadPrivateKey(privateKeyPem), 'base64')
}

/// RSA 验签（SHA256withRSA）— 对照后端 RsaSignUtil#verify
export function rsaVerify(data: string, signB64: string, publicKeyPem: string): boolean {
  const verifier = crypto.createVerify('SHA256')
  verifier.update(data, 'utf8')
  return verifier.verify(loadPublicKey(publicKeyPem), signB64, 'base64')
}
