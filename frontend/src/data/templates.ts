import type { RegexTemplate } from '../types'
import data from './templates.json'

/**
 * 模板元数据的唯一来源是 ./templates.json
 * （说明、分类、正则、测试样例集中维护）。
 * scripts/validate-templates.mjs 会在启动前/流水线中校验其结构，
 * 新增模板时缺字段或样例不匹配会在该环节直接报错。
 */
export const TEMPLATE_CATEGORIES: readonly string[] = data.categories

export const TEMPLATES: RegexTemplate[] = data.templates.map(t => ({
  name: t.name,
  pattern: t.pattern,
  description: t.description,
  testString: t.testString,
  category: t.category
}))
