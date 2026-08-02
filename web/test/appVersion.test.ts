import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readAppVersion } from '../version'

describe('readAppVersion', () => {
  it('returns the version from this app\'s own package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(readAppVersion()).toBe(pkg.version)
  })

  it('reads a semver-shaped string', () => {
    expect(readAppVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('throws, naming the file, when the version field is missing', () => {
    const path = join(tmpdir(), `te-uma-no-version-${Date.now()}.json`)
    writeFileSync(path, JSON.stringify({ name: 'web' }), 'utf8')
    expect(() => readAppVersion(pathToFileURL(path))).toThrow(/version/)
  })
})
