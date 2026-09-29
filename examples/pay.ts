// 牛盾支付 支付下单示例 — Node.js
// 运行前：启动后端（niudun-start，端口 9999），并替换为真实商户密钥
import { NiuDunClient } from '../src/index'
import type { PayParam } from '../src/index'

// 商户私钥 + 平台公钥（PEM 文本，生产环境从配置中心/环境变量读取，切勿硬编码）
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
（替换为你的商户私钥）
-----END PRIVATE KEY-----`
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
（替换为平台公钥）
-----END PUBLIC KEY-----`

async function main() {
  const client = new NiuDunClient({
    serviceUrl: 'http://127.0.0.1:9999',
    mchNo: 'M200000001',
    appId: 'APP001',
    privateKey: PRIVATE_KEY,
    publicKey: PUBLIC_KEY,
    timeout: 30000,
  })

  const param: PayParam = {
    bizOrderNo: 'PAY_' + Date.now(),
    title: '测试商品',
    amount: 100, // 分
    method: 'wechat_qr',
    notifyUrl: 'https://example.com/notify',
  }

  const result = await client.pay(param)
  console.log('支付下单结果:')
  console.log('  订单号:', result.data?.orderNo)
  console.log('  交易号:', result.data?.tradeNo)
  console.log('  状态:', result.data?.status)
  console.log('  支付参数体:', result.data?.payBody)
  console.log('  支付参数体类型:', result.data?.payBodyType)
}

main().catch((err) => {
  console.error('支付失败:', err)
  process.exit(1)
})
