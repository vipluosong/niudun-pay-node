import { describe, it, expect } from 'vitest'
import { buildSignStr } from '../src/sign'
import { rsaSign, rsaVerify } from '../src/rsa'
import { PRIVATE_KEY, PUBLIC_KEY, V1, V2, V3 } from './vectors'

// 黄金向量测试 — 四语言 SDK 签名行为一致性的硬验收标准
// 对照 _doc/design/sdk-test-vectors.md

describe('黄金向量 V1：基础支付请求', () => {
  const json = JSON.stringify(V1.input)

  it('签名串拼接一致（排序/排除sign/中文）', () => {
    expect(buildSignStr(json)).toBe(V1.expectedSignStr)
  })

  it('RSA 签名值一致（SHA256withRSA Base64）', () => {
    expect(rsaSign(V1.expectedSignStr, PRIVATE_KEY)).toBe(V1.expectedSign)
  })

  it('公钥验签通过', () => {
    expect(rsaVerify(V1.expectedSignStr, V1.expectedSign, PUBLIC_KEY)).toBe(true)
  })
})

describe('黄金向量 V2：嵌套对象 + 列表 + 特殊字符', () => {
  const json = JSON.stringify(V2.input)

  it('签名串拼接一致（terminal./goodsDetail[0]/含&和JSON字符串的值）', () => {
    expect(buildSignStr(json)).toBe(V2.expectedSignStr)
  })

  it('RSA 签名值一致', () => {
    expect(rsaSign(V2.expectedSignStr, PRIVATE_KEY)).toBe(V2.expectedSign)
  })

  it('公钥验签通过', () => {
    expect(rsaVerify(V2.expectedSignStr, V2.expectedSign, PUBLIC_KEY)).toBe(true)
  })
})

describe('黄金向量 V3：响应体验签', () => {
  const json = JSON.stringify(V3.input)

  it('签名串拼接一致（嵌套data./resTime 北京时间）', () => {
    expect(buildSignStr(json)).toBe(V3.expectedSignStr)
  })

  it('RSA 签名值一致', () => {
    expect(rsaSign(V3.expectedSignStr, PRIVATE_KEY)).toBe(V3.expectedSign)
  })

  it('公钥验签通过', () => {
    expect(rsaVerify(V3.expectedSignStr, V3.expectedSign, PUBLIC_KEY)).toBe(true)
  })

  it('篡改 data 后验签失败', () => {
    const tampered = { ...V3.input, msg: 'tampered' }
    expect(rsaVerify(buildSignStr(JSON.stringify(tampered)), V3.expectedSign, PUBLIC_KEY)).toBe(false)
  })
})
