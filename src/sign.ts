/// 签名字符串构造 — 严格复刻后端 JsonSignStrUtil
/// 权威源: cn.niudun.open.payment.common.util.JsonSignStrUtil

// 扁平化 JSON（复刻 JsonSignStrUtil#flatten）
// null 跳过; 布尔/数字 toString; 字符串原样; 数组用 [i]; 对象用 .key
function flatten(prefix: string, value: unknown, result: Record<string, string>): void {
  if (value === null || value === undefined) {
    return
  }
  if (typeof value === 'boolean') {
    result[prefix] = String(value)
    return
  }
  if (typeof value === 'number') {
    // 整数/浮点按字面 toString（与 Java Number.toString 一致）
    result[prefix] = String(value)
    return
  }
  if (typeof value === 'string') {
    result[prefix] = value
    return
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      flatten(prefix + '[' + i + ']', value[i], result)
    }
    return
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const k of Object.keys(obj)) {
      const key = prefix === '' ? k : prefix + '.' + k
      flatten(key, obj[k], result)
    }
  }
}

/// 构造待签名字符串（复刻 JsonSignStrUtil#buildSignStr）
/// 输入 JSON 字符串 → 扁平化 → ASCII 字典序排序 → 排除 sign（大小写不敏感）→ k=v&k=v
export function buildSignStr(jsonStr: string): string {
  const root = JSON.parse(jsonStr)
  const flat: Record<string, string> = {}
  flatten('', root, flat)
  // ASCII 字典序（Java TreeMap 按 String.compareTo / JS 默认 sort，均 UTF-16 code unit）
  const keys = Object.keys(flat).sort()
  const parts: string[] = []
  for (const k of keys) {
    if (k.toLowerCase() === 'sign') {
      continue
    }
    parts.push(k + '=' + flat[k])
  }
  return parts.join('&')
}
