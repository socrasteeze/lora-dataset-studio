// Run independent frontend suites sequentially and preserve the first failure.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function runSuites(run = spawnSync) {
  let exitCode = 0
  for (const args of [
    ['--import', './scripts/registerSdk.mjs', '--test'],
    ['scripts/testBundled.mjs'],
  ]) {
    const result = run(process.execPath, args, { stdio: 'inherit' })
    const code = result.status ?? 1
    if (result.error) console.error(result.error.message)
    if (code !== 0 && exitCode === 0) exitCode = code
  }
  return exitCode
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runSuites()
}
