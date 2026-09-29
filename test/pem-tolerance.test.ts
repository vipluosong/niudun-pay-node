import { describe, it, expect } from 'vitest'
import {
  loadPrivateKey,
  loadPublicKey,
  rsaSign,
  rsaVerify,
  validatePublicKeyPEM,
} from '../src/rsa'
import { PRIVATE_KEY, PUBLIC_KEY, V1 } from './vectors'

// 密钥文本容错：从网页 / 聊天窗口 / PDF 复制 PEM 时换行常被破坏，
// 这类「能看不能用」的粘贴形态都应解析出同一把密钥（五语言 SDK 同名用例，行为一致）。

/// 拆出 PEM 的头行 / 正文 / 尾行
function splitPem(pem: string) {
  const lines = pem.trim().split('\n')
  return { head: lines[0], body: lines.slice(1, -1).join('\n'), foot: lines[lines.length - 1] }
}

/// 把正文按 width 重新分行，行间以 sep 连接（width <= 0 表示整段一行）
function rewrap(body: string, sep: string, width = 64): string {
  const flat = body.replace(/\n/g, '')
  if (width <= 0) return flat
  const parts: string[] = []
  for (let i = 0; i < flat.length; i += width) parts.push(flat.slice(i, i + width))
  return parts.join(sep)
}

const pub = splitPem(PUBLIC_KEY)
const pubFlat = rewrap(pub.body, '', 0)
const wantSpki = loadPublicKey(PUBLIC_KEY).export({ format: 'der', type: 'spki' })

describe('密钥文本容错：公钥各种粘贴形态', () => {
  const cases: Array<{ name: string; text: string }> = [
    { name: '标准 PEM', text: PUBLIC_KEY },
    { name: '正文单行不换行', text: `${pub.head}\n${pubFlat}\n${pub.foot}` },
    { name: '正文换行→空格', text: `${pub.head}\n${rewrap(pub.body, ' ')}\n${pub.foot}` },
    { name: '全文压成一行', text: `${pub.head} ${rewrap(pub.body, ' ')} ${pub.foot}` },
    { name: 'BEGIN 行尾换行→空格', text: `${pub.head} ${rewrap(pub.body, '\n')}\n${pub.foot}` },
    { name: 'END 前换行→空格', text: `${pub.head}\n${rewrap(pub.body, '\n')} ${pub.foot}` },
    {
      name: '正文含 NBSP',
      text: `${pub.head}\n${pubFlat.slice(0, 64)}\u00a0${pubFlat.slice(64)}\n${pub.foot}`,
    },
    { name: 'NBSP 当换行分隔符', text: `${pub.head}\n${rewrap(pub.body, '\u00a0')}\n${pub.foot}` },
    {
      name: '正文含零宽空格',
      text: `${pub.head}\n${pubFlat.slice(0, 64)}\u200b${pubFlat.slice(64)}\n${pub.foot}`,
    },
    {
      name: '正文含 BOM',
      text: `${pub.head}\n${pubFlat.slice(0, 64)}\ufeff${pubFlat.slice(64)}\n${pub.foot}`,
    },
    { name: '裸 Base64（无头尾标记）', text: pubFlat },
    { name: 'CRLF 换行', text: PUBLIC_KEY.replace(/\n/g, '\r\n') },
    { name: 'CR 换行', text: PUBLIC_KEY.trim().replace(/\n/g, '\r') },
    { name: '前后带说明文字', text: `这是平台公钥：\n${PUBLIC_KEY}\n请妥善保管` },
  ]

  for (const { name, text } of cases) {
    it(name, () => {
      const got = loadPublicKey(text).export({ format: 'der', type: 'spki' })
      expect(got.equals(wantSpki)).toBe(true)
    })
  }

  it('变形公钥仍可完成验签', () => {
    const flattened = `${pub.head} ${rewrap(pub.body, ' ')} ${pub.foot}`
    const sign = rsaSign(V1.expectedSignStr, PRIVATE_KEY)
    expect(rsaVerify(V1.expectedSignStr, sign, flattened)).toBe(true)
  })
})

describe('密钥文本容错：私钥与非法输入', () => {
  const priv = splitPem(PRIVATE_KEY)
  const privFlat = rewrap(priv.body, '', 0)
  const wantPkcs8 = loadPrivateKey(PRIVATE_KEY).export({ format: 'der', type: 'pkcs8' })

  it('私钥全文压成一行', () => {
    const text = `${priv.head} ${rewrap(priv.body, ' ')} ${priv.foot}`
    expect(loadPrivateKey(text).export({ format: 'der', type: 'pkcs8' }).equals(wantPkcs8)).toBe(true)
  })

  it('私钥正文含 NBSP', () => {
    const text = `${priv.head}\n${privFlat.slice(0, 64)}\u00a0${privFlat.slice(64)}\n${priv.foot}`
    expect(loadPrivateKey(text).export({ format: 'der', type: 'pkcs8' }).equals(wantPkcs8)).toBe(true)
  })

  it('导出校验入口放行变形公钥', () => {
    const flattened = `${pub.head} ${rewrap(pub.body, ' ')} ${pub.foot}`
    expect(() => validatePublicKeyPEM(flattened)).not.toThrow()
  })

  it('空内容给出可定位报错', () => {
    expect(() => loadPublicKey('   ')).toThrow('内容为空')
  })

  it('非密钥文本给出可定位报错', () => {
    expect(() => loadPublicKey('这不是密钥')).toThrow('不是合法的 Base64')
  })

  it('只有 BEGIN 无 END 给出可定位报错', () => {
    expect(() => loadPublicKey('-----BEGIN PUBLIC KEY-----')).toThrow('未找到密钥内容')
  })

  it('Base64 合法但非密钥给出可定位报错', () => {
    expect(() => loadPublicKey('YWJjZGVmZ2g=')).toThrow('需为 X.509')
  })
})
