#!/usr/bin/env node
/**
 * 依赖锁一致性检查：
 *   1. package-lock.json 必须存在（锁文件需提交，保证各机器安装出相同版本）
 *   2. 锁文件根包记录的依赖规格必须与 package.json 完全一致
 *
 * 背景：npm ci 只校验「锁定版本是否满足 package.json 的版本范围」，当规格字符串变化
 * 但锁定版本仍满足新范围时不会报错（如 ^3.4.0 改成 ^3.5.0，而锁定的 3.5.43 两者都满足）。
 * 本脚本显式比对规格声明，确保"依赖声明变化但忘记更新/提交锁文件"也能被拦下。
 *
 * 只读：不修改 package.json 或锁文件。退出码 1 表示检查失败。
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PKG_FILE = resolve(ROOT, 'package.json')
const LOCKFILE = resolve(ROOT, 'package-lock.json')

export function checkLockfile() {
  console.log('▶ [依赖锁一致性检查] package.json ↔ package-lock.json')
  if (!existsSync(LOCKFILE)) {
    console.error(`  ✗ 缺少 package-lock.json。请执行 npm install 生成锁文件并提交`)
    return { ok: false, drift: [] }
  }
  const pkg = JSON.parse(readFileSync(PKG_FILE, 'utf8'))
  const lock = JSON.parse(readFileSync(LOCKFILE, 'utf8'))
  const root = (lock.packages && lock.packages['']) || {}

  const groups = [
    ['dependencies', pkg.dependencies, root.dependencies],
    ['devDependencies', pkg.devDependencies, root.devDependencies],
    ['optionalDependencies', pkg.optionalDependencies, root.optionalDependencies],
    ['peerDependencies', pkg.peerDependencies, root.peerDependencies]
  ]
  const drift = []
  for (const [group, declared = {}, locked = {}] of groups) {
    for (const name of new Set([...Object.keys(declared), ...Object.keys(locked)])) {
      if (declared[name] !== locked[name]) {
        drift.push(`${group}.${name}: package.json 为「${declared[name] ?? '（未声明）'}」，锁文件为「${locked[name] ?? '（缺失）'}」`)
      }
    }
  }

  if (drift.length) {
    for (const d of drift) console.error(`  ✗ 依赖规格不一致：${d}`)
    console.error('  ✗ 请执行 npm install 更新 package-lock.json 并一并提交（不要手改锁文件）')
    return { ok: false, drift }
  }
  console.log('  ✓ 锁文件存在，且 dependencies / devDependencies 规格与 package.json 完全一致')
  return { ok: true, drift: [] }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  process.exit(checkLockfile().ok ? 0 : 1)
}
