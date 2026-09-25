#!/usr/bin/env node
/**
 * 依赖锁文件检查（只读）
 *
 * 解决的问题：package-lock.json 缺失或未随 package.json 一起更新时，
 * 不同机器 npm install 会解析出不同的依赖版本（当前仓库的 .gitignore
 * 曾忽略 package-lock.json，node_modules 还出现过跨平台拷贝的二进制不匹配）。
 *
 * 检查项：
 *   1. package-lock.json 存在
 *   2. 锁文件 lockfileVersion 受支持（v2/v3，对应 npm 7+）
 *   3. 锁文件根条目记录的依赖与 package.json 声明一致（名称、版本范围）
 *      —— package.json 改了但忘记重新生成锁文件会在这里被指出
 *
 * 本脚本不执行安装、不修改任何文件；可安全重复执行。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PKG = join(root, 'package.json')
const LOCK = join(root, 'package-lock.json')

const errors = []
const tips = []

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    errors.push(`无法解析 ${label}: ${e.message}`)
    return null
  }
}

if (!existsSync(PKG)) {
  console.error('✗ 依赖锁文件检查失败：package.json 不存在')
  process.exit(1)
}
const pkg = readJson(PKG, 'package.json')

if (!existsSync(LOCK)) {
  console.error('✗ 依赖锁文件检查失败：缺少 package-lock.json')
  console.error('  本地安装会因缺少锁文件在不同机器解析出不同依赖版本。')
  console.error('  修复步骤：cd frontend && npm install   （生成或更新 package-lock.json）')
  console.error('  并确认 .gitignore 未忽略 package-lock.json，然后将锁文件提交到仓库。')
  process.exit(1)
}

const lock = readJson(LOCK, 'package-lock.json')
if (!pkg || !lock) {
  console.error('✗ 依赖锁文件检查失败')
  errors.forEach(e => console.error(`  ${e}`))
  process.exit(1)
}

if (![2, 3].includes(Number(lock.lockfileVersion))) {
  errors.push(`lockfileVersion=${lock.lockfileVersion} 不受支持（需要 2 或 3，请使用 npm 7+ 重新生成）`)
}

const declared = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.optionalDependencies || {})
}
const lockedRoot = (lock.packages && lock.packages['']) || {}
const locked = {
  ...(lockedRoot.dependencies || {}),
  ...(lockedRoot.devDependencies || {}),
  ...(lockedRoot.optionalDependencies || {})
}

for (const [name, range] of Object.entries(declared)) {
  if (!(name in locked)) {
    errors.push(`package.json 声明了 "${name}": "${range}"，但锁文件根条目未记录 —— 依赖变更后未更新锁文件`)
  } else if (locked[name] !== range) {
    errors.push(`"${name}" 版本范围不一致：package.json 为 "${range}"，锁文件为 "${locked[name]}"`)
  }
  // 校验锁文件里确实解析出了具体版本（防止手工删减锁文件条目）
  const resolvedEntry = lock.packages && lock.packages[`node_modules/${name}`]
  if (!resolvedEntry || !resolvedEntry.version) {
    errors.push(`锁文件缺少 ${name} 的解析条目 node_modules/${name}（锁文件可能损坏，请重新生成）`)
  }
}

for (const name of Object.keys(locked)) {
  if (!(name in declared)) {
    tips.push(`锁文件根条目含 "${name}"，但 package.json 已不再声明（建议执行 npm install 刷新锁文件）`)
  }
}

if (errors.length > 0) {
  console.error('✗ 依赖锁文件检查失败（package-lock.json 与 package.json 不一致）')
  errors.forEach(e => console.error(`  - ${e}`))
  console.error('  修复步骤：cd frontend && npm install   （以 package.json 为准重新解析并更新锁文件）')
  process.exit(1)
}

const depCount = Object.keys(declared).length
console.log(`✓ 依赖锁文件检查通过：lockfileVersion ${lock.lockfileVersion}，锁定 ${depCount} 个直接依赖`)
tips.forEach(t => console.log(`  ${t}`))
