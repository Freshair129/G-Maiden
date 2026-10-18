import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import PublicDemo from './PublicDemo'

describe('PublicDemo', () => {
  it('renders the deterministic scenario, controls, feature states, and privacy boundary', () => {
    const html = renderToStaticMarkup(<PublicDemo />)

    expect(html).toContain('G-MAIDEN / PUBLIC DEMO')
    expect(html).toContain('Incoming-gank scenario')
    expect(html).toContain('Demo timeline')
    expect(html).toContain('Shipped')
    expect(html).toContain('Partial')
    expect(html).toContain('Preview')
    expect(html).toContain('Planned')
    expect(html).toContain('SYNTHETIC DATA')
    expect(html).toContain('ไม่ต้องลงชื่อเข้าใช้')
  })
})
