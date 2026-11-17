import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// The portable launch variables in src/main/index.ts, pinned by POSITION
// (HTOO-667). The template's bootOrder.test.ts holds the same check.
//
// Read as text, because index.ts loads the electron module, and position is
// the property under test. Comments are removed first: the comment over the
// statement names the same identifiers.
const RAW = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8')
const MAIN = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('portable launch variables (HTOO-667)', () => {
  it('reads and removes them before any other statement reads process.env', () => {
    const take = MAIN.search(
      /^const isOwnPortable = takePortableLaunch\(process\.env, PACKAGE_NAME\)/m
    )
    expect(take, 'takePortableLaunch statement not found in index.ts').toBeGreaterThan(-1)
    // The companion folder is read on the line before, and nothing else reads
    // process.env before either of them.
    const read = MAIN.search(
      /^const portableDir = ownPortableLauncherDir\(process\.env, PACKAGE_NAME\)\n(?=const isOwnPortable = takePortableLaunch)/m
    )
    expect(read, 'ownPortableLauncherDir must be the line before takePortableLaunch').toBe(
      MAIN.indexOf('const portableDir')
    )
    expect(read).toBeGreaterThan(-1)
    expect(MAIN.indexOf('ownPortableLauncherDir(process.env')).toBeLessThanOrEqual(
      MAIN.indexOf('process.env')
    )
    expect(MAIN).not.toMatch(/process\.env\[?['".]?PORTABLE_EXECUTABLE/)
    expect(MAIN).toMatch(/isPortable: app\.isPackaged && isOwnPortable/)
  })

  it('hands the companion folder to the handler context', () => {
    // takePortableLaunch removes PORTABLE_EXECUTABLE_DIR, so the companion
    // search finds the folder only through ctx.portableDir.
    const ctxLiteral = MAIN.slice(MAIN.indexOf('export const ctx: HandlerContext = {'))
    expect(ctxLiteral.slice(0, ctxLiteral.indexOf('\n}'))).toMatch(/^\s+portableDir,?$/m)
  })
})
