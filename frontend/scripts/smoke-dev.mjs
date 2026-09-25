#!/usr/bin/env node
/**
 * 本地启动冒烟检查：在独立端口启动 vite 开发服务器，验证首页可访问。
 *
 * - 与日常 5173 端口隔离（固定 5199 + --strictPort），互不占用
 * - 显式绑定 127.0.0.1，避免 localhost 解析到 IPv6 导致连接失败
 * - 脚本退出时必定回收服务器进程组，不留下残留进程
 * - 只读检查，不产生任何文件
 *
 * 既可被 scripts/check.mjs 复用，也可在流水线中单独执行：node scripts/smoke-dev.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import process from 'node:process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const requireFromHere = createRequire(import.meta.url)
const VITE_PKG_DIR = dirname(requireFromHere.resolve('vite/package.json'))
const VITE_BIN = resolve(VITE_PKG_DIR, requireFromHere('vite/package.json').bin.vite)
const SMOKE_HOST = '127.0.0.1'
const SMOKE_PORT = 5199

const sleep = ms => new Promise(res => setTimeout(res, ms))

export async function runDevSmoke({ silent = false } = {}) {
  const log = []
  const child = spawn(
    process.execPath,
    [VITE_BIN, '--host', SMOKE_HOST, '--port', String(SMOKE_PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  )
  const collect = buf => log.push(buf.toString())
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  /**
   * 优雅关闭：先让 Vite 主进程自行退出（正常关闭 esbuild 扫描服务，避免 EPIPE），
   * 超时再强杀整个进程组兜底。
   * @returns {Promise<void>}
   */
  const shutdown = () => new Promise(promiseResolve => {
    let settled = false
    const finish = () => { if (!settled) { settled = true; promiseResolve() } }
    child.once('exit', () => setTimeout(finish, 100))
    try { child.kill('SIGTERM') } catch { /* 已退出 */ }
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL') } catch { /* 进程组已不存在 */ }
      finish()
    }, 3000)
  })

  const deadline = Date.now() + 60_000
  let lastErr
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        if (!silent) console.error(log.join(''))
        return { ok: false, error: new Error('开发服务器进程提前退出') }
      }
      try {
        const res = await fetch(`http://${SMOKE_HOST}:${SMOKE_PORT}/`)
        if (res.ok) {
          const html = await res.text()
          if (!html.includes('<div id="app"></div>')) {
            throw new Error('首页 HTML 未找到 #app 挂载点')
          }
          await shutdown()
          return { ok: true, log: log.join(''), url: `http://${SMOKE_HOST}:${SMOKE_PORT}/` }
        }
        lastErr = new Error(`HTTP ${res.status}`)
      } catch (e) {
        lastErr = e
      }
      await sleep(500)
    }
    await shutdown()
    if (!silent) console.error(log.join(''))
    return { ok: false, error: new Error(`开发服务器在 60 秒内未就绪：${lastErr && lastErr.message}`) }
  } catch (e) {
    await shutdown()
    return { ok: false, error: e }
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  console.log('▶ [本地启动冒烟] 启动 vite 开发服务器并访问首页…')
  const result = await runDevSmoke()
  if (!result.ok) {
    console.error(`  ✗ 冒烟失败：${result.error.message}`)
    process.exit(1)
  }
  console.log(`  （开发服务器日志）\n${result.log.trimEnd().split('\n').map(l => '    ' + l).join('\n')}`)
  console.log(`  ✓ 首页 ${result.url} 返回 200 且包含 #app 挂载点`)
}
