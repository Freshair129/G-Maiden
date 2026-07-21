import { describe, expect, it } from 'vitest'
import { legalBody } from './legalContent'

describe('legalBody', () => {
  it('shows the approved legal text without governance frontmatter or changelog', () => {
    expect(legalBody('---\nversion: 1\n---\n# Terms\nBody\n## CHANGELOG\ninternal')).toBe('# Terms\nBody')
  })
})
