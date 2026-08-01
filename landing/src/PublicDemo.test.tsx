import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./beta', () => ({
  useBetaEnrollment: () => ({
    status: 'signed-out',
    gid: '',
    error: '',
    register: vi.fn(),
  }),
}))

import PublicDemo from './PublicDemo'

describe('PublicDemo', () => {
  it('renders the deterministic scenario, controls, feature states and beta CTA', () => {
    const html = renderToStaticMarkup(<PublicDemo />)

    expect(html).toContain('G-MAIDEN / PUBLIC DEMO')
    expect(html).toContain('Incoming-gank scenario')
    expect(html).toContain('Demo timeline')
    expect(html).toContain('Shipped')
    expect(html).toContain('Partial')
    expect(html).toContain('Preview')
    expect(html).toContain('Planned')
    expect(html).toContain('สมัคร Closed Beta')
    expect(html).toContain('SYNTHETIC DATA')
  })
})
