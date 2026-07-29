import { describe, expect, it } from 'vitest'
import { assetUrl } from '../app/composables/assetUrl'

describe('assetUrl', () => {
  it('joins a same-origin base with a relative path', () => {
    expect(assetUrl('density-1/middle/m3d.nrrd', '/modelView/'))
      .toBe('/modelView/density-1/middle/m3d.nrrd')
  })

  it('tolerates a base without a trailing slash', () => {
    expect(assetUrl('density-1/left/density25.glb', '/modelView'))
      .toBe('/modelView/density-1/left/density25.glb')
  })

  it('tolerates a path with a leading slash', () => {
    expect(assetUrl('/density-1/middle/m_view.json', '/modelView/'))
      .toBe('/modelView/density-1/middle/m_view.json')
  })

  it('supports an absolute CDN base', () => {
    expect(assetUrl('cancer-dcis/right/mri.nrrd', 'https://cdn.example.org/te-uma/'))
      .toBe('https://cdn.example.org/te-uma/cancer-dcis/right/mri.nrrd')
  })

  it('does not collapse a double slash inside the path itself', () => {
    expect(assetUrl('a//b.nrrd', '/modelView/')).toBe('/modelView/a//b.nrrd')
  })

  it('throws on an empty path rather than returning the bare base', () => {
    expect(() => assetUrl('', '/modelView/')).toThrow(/empty/i)
  })
})
