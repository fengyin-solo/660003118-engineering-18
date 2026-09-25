#!/usr/bin/env node
/**
 * 模板元数据校验（单一数据源：data/templates.json）
 *
 * 校验内容：
 *   1. JSON 可解析、顶层结构正确（categories / templates）
 *   2. 每个模板必须且只能包含 name / pattern / description / testString / category
 *   3. name 非空且唯一（模板库列表以 name 作为 :key）
 *   4. pattern 必须是合法的 JavaScript 正则表达式
 *   5. category 必须在 categories 列表内
 *   6. testString 按空白拆成的每个样例都必须能被 pattern 命中
 *      （测试样例与正则分散维护时，写错/对不上会在这里暴露）
 *      样例本身含空格时（如 HTML 标签），可提供可选字段 testCases: string[]
 *      显式列出样例；该校验字段不会进入应用（应用只使用 testString）。
 *
 * 只读：不修改任何文件。全部错误收集后一次性输出，退出码 1 表示校验失败。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = resolve(HERE, '..', 'data', 'templates.json')
const REQUIRED_FIELDS = ['name', 'pattern', 'description', 'testString', 'category']
const OPTIONAL_FIELDS = ['testCases']

function fail(message) {
  console.error(`  ✗ ${message}`)
  return false
}

export function validateTemplates(file = DATA_FILE) {
  const errors = []
  console.log(`▶ [模板元数据校验] ${file}`)

  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    fail(`JSON 解析失败：${e.message}`)
    return { ok: false, errors: [e.message], count: 0 }
  }

  const categories = doc.categories
  if (!Array.isArray(categories) || categories.length === 0) {
    errors.push('顶层 categories 必须是非空字符串数组')
  } else if (!categories.every(c => typeof c === 'string' && c.trim())) {
    errors.push('categories 中存在空值或非字符串项')
  } else if (new Set(categories).size !== categories.length) {
    errors.push(`categories 存在重复分类：${categories.join(' / ')}`)
  }
  const categorySet = new Set(categories || [])

  const templates = doc.templates
  if (!Array.isArray(templates) || templates.length === 0) {
    errors.push('顶层 templates 必须是非空数组')
    console.error(`  ✗ 模板列表为空或结构错误`)
    return { ok: false, errors, count: 0 }
  }

  const seenNames = new Set()
  let patternsChecked = 0

  templates.forEach((tpl, i) => {
    const label = `第 ${i + 1} 个模板${tpl && typeof tpl.name === 'string' && tpl.name ? `「${tpl.name}」` : ''}`

    if (tpl === null || typeof tpl !== 'object' || Array.isArray(tpl)) {
      errors.push(`${label}：必须是对象`)
      return
    }

    for (const field of REQUIRED_FIELDS) {
      const v = tpl[field]
      if (v === undefined) {
        errors.push(`${label}：缺少字段 ${field}`)
      } else if (typeof v !== 'string') {
        errors.push(`${label}：字段 ${field} 必须是字符串（当前类型 ${Array.isArray(v) ? 'array' : typeof v}）`)
      } else if (v.trim() === '') {
        errors.push(`${label}：字段 ${field} 不能为空字符串`)
      }
    }

    const unknown = Object.keys(tpl).filter(k => !REQUIRED_FIELDS.includes(k) && !OPTIONAL_FIELDS.includes(k))
    if (unknown.length) errors.push(`${label}：存在未定义字段 ${unknown.join(', ')}（字段名拼写错误？）`)

    if (Array.isArray(tpl.testCases)) {
      if (tpl.testCases.length === 0) {
        errors.push(`${label}：testCases 必须是非空数组，或直接删除该字段`)
      }
      tpl.testCases.forEach((s, j) => {
        if (typeof s !== 'string' || s.trim() === '') {
          errors.push(`${label}：testCases[${j}] 必须是非空字符串`)
        }
      })
    } else if (tpl.testCases !== undefined) {
      errors.push(`${label}：testCases 必须是字符串数组（每个元素是一条测试样例）`)
    }

    if (typeof tpl.name === 'string' && tpl.name) {
      if (seenNames.has(tpl.name)) errors.push(`${label}：name 重复（模板列表以 name 作为 key，必须唯一）`)
      seenNames.add(tpl.name)
    }

    let re = null
    if (typeof tpl.pattern === 'string' && tpl.pattern) {
      try {
        re = new RegExp(tpl.pattern)
        patternsChecked++
      } catch (e) {
        errors.push(`${label}：pattern 不是合法正则 —— ${e.message}`)
      }
    }

    if (typeof tpl.category === 'string' && tpl.category && !categorySet.has(tpl.category)) {
      errors.push(`${label}：category「${tpl.category}」不在 categories 列表 [${[...categorySet].join(', ')}] 中`)
    }

    if (re && typeof tpl.testString === 'string' && tpl.testString.trim()) {
      // 有 testCases 时以显式样例为准（样例本身可含空格）；否则按空白从 testString 拆分
      const samples = Array.isArray(tpl.testCases) && tpl.testCases.every(s => typeof s === 'string' && s)
        ? tpl.testCases
        : tpl.testString.split(/\s+/).filter(Boolean)
      if (samples.length === 0) {
        errors.push(`${label}：testString 至少包含一个测试样例`)
      }
      for (const sample of samples) {
        if (!re.test(sample)) {
          errors.push(`${label}：测试样例「${sample}」无法被 pattern 命中（testString 与 pattern 是否对得上？）`)
        }
      }
    }
  })

  const ok = errors.length === 0
  if (ok) {
    console.log(`  ✓ ${templates.length} 个模板全部通过：5 个必填字段齐全、name 唯一、${patternsChecked} 条正则合法、分类与测试样例均有效`)
  } else {
    for (const e of errors) fail(e)
    console.error(`  ✗ 共发现 ${errors.length} 个问题（模板元数据校验阶段失败）`)
  }
  return { ok, errors, count: templates.length }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const target = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DATA_FILE
  const { ok } = validateTemplates(target)
  process.exit(ok ? 0 : 1)
}
