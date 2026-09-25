#!/usr/bin/env node
/**
 * 模板元数据校验（只读）
 *
 * 唯一数据源：src/data/templates.json
 * 校验内容：
 *   1. 文件结构：version / categories / templates
 *   2. 每条模板必须且只能包含 name / category / pattern / description / testString
 *      —— 新增模板漏字段、拼错字段名会在这里直接报错
 *   3. name 不重复，category 必须在 categories 中声明
 *   4. pattern 必须是合法正则
 *   5. testString 中每个空白分隔的样例都必须能被 pattern 命中
 *      （锚定 ^...$ 的模板要求整段完全匹配，非锚定模板要求至少一个样例命中）
 *
 * 本脚本不写入、不修改任何文件；可安全重复执行。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(here, '..', 'src', 'data', 'templates.json')
const REQUIRED_FIELDS = ['name', 'category', 'pattern', 'description', 'testString']

const errors = []
const notes = []

function fail(location, message) {
  errors.push(`  [${location}] ${message}`)
}

let data
try {
  data = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
} catch (e) {
  console.error(`✗ 模板元数据校验失败：无法读取/解析 src/data/templates.json`)
  console.error(`  ${e.message}`)
  process.exit(1)
}

// ---- 顶层结构 ----
if (typeof data.version !== 'number') {
  fail('根节点', '缺少数字类型字段 "version"')
}
if (!Array.isArray(data.categories) || data.categories.length === 0) {
  fail('根节点', '缺少非空数组 "categories"（模板分类的唯一声明处）')
}
if (!Array.isArray(data.templates) || data.templates.length === 0) {
  fail('根节点', '缺少非空数组 "templates"')
}

const categories = Array.isArray(data.categories) ? data.categories : []
const categorySet = new Set()
for (const [i, c] of categories.entries()) {
  if (typeof c !== 'string' || c.trim() === '') fail(`categories[${i}]`, '分类名必须是非空字符串')
  else if (categorySet.has(c)) fail(`categories[${i}]`, `分类 "${c}" 重复声明`)
  categorySet.add(c)
}

const templates = Array.isArray(data.templates) ? data.templates : []
const usedCategories = new Set()
const nameSet = new Set()

templates.forEach((t, i) => {
  const loc = `模板 #${i + 1}${t && typeof t.name === 'string' && t.name ? ` "${t.name}"` : ''}`

  if (t === null || typeof t !== 'object' || Array.isArray(t)) {
    fail(loc, '必须是对象')
    return
  }

  // 缺字段 / 空字段
  for (const field of REQUIRED_FIELDS) {
    if (!(field in t)) {
      fail(loc, `缺少字段: ${field}`)
    } else if (typeof t[field] !== 'string') {
      fail(loc, `字段 ${field} 必须是字符串（当前: ${typeof t[field]}）`)
    } else if (t[field].trim() === '') {
      fail(loc, `字段 ${field} 不能为空`)
    }
  }

  // 多余字段（常见于新增模板时拼错字段名）
  for (const key of Object.keys(t)) {
    if (!REQUIRED_FIELDS.includes(key)) fail(loc, `未知字段: ${key}（允许: ${REQUIRED_FIELDS.join('/')}）`)
  }

  if (typeof t.name === 'string' && t.name.trim()) {
    if (nameSet.has(t.name)) fail(loc, `name "${t.name}" 与其他模板重复`)
    nameSet.add(t.name)
  }

  if (typeof t.category === 'string' && t.category.trim()) {
    if (!categorySet.has(t.category)) {
      fail(loc, `category "${t.category}" 未在顶层 categories 中声明`)
    }
    usedCategories.add(t.category)
  }

  // 正则可编译
  let re
  if (typeof t.pattern === 'string' && t.pattern.trim()) {
    try {
      re = new RegExp(t.pattern)
    } catch (e) {
      fail(loc, `pattern 不是合法正则: ${e.message}`)
    }
  }

  // 测试样例必须可命中
  if (re && typeof t.testString === 'string' && t.testString.trim()) {
    const samples = t.testString.split(/\s+/).filter(Boolean)
    if (samples.length === 0) {
      fail(loc, 'testString 至少要包含一个样例')
    }
    const anchored = t.pattern.startsWith('^') && t.pattern.endsWith('$')
    let matchedAny = false
    for (const sample of samples) {
      const m = re.exec(sample)
      const fullHit = m !== null && m.index === 0 && m[0].length === sample.length
      if (anchored) {
        if (!fullHit) fail(loc, `样例 "${sample}" 未被 ^...$ 整段匹配（pattern: ${t.pattern}）`)
        else matchedAny = true
      } else if (m) {
        matchedAny = true
      }
    }
    if (!anchored && samples.length > 0 && !matchedAny) {
      fail(loc, `testString 中没有任何样例能被 pattern 命中: ${t.testString}`)
    }
  }
})

// 声明了但没有模板使用的分类：提示，不阻断
for (const c of categorySet) {
  if (!usedCategories.has(c)) notes.push(`  提示: 分类 "${c}" 已声明但暂无模板使用`)
}

if (errors.length > 0) {
  console.error(`✗ 模板元数据校验失败（src/data/templates.json）`)
  console.error(errors.join('\n'))
  console.error(`  共 ${errors.length} 个问题`)
  process.exit(1)
}

console.log(`✓ 模板元数据校验通过：${templates.length} 个模板 / ${categorySet.size} 个分类（src/data/templates.json）`)
if (notes.length) console.log(notes.join('\n'))
