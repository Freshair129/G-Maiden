import { describe, expect, it, vi } from 'vitest'
import { VrzoBannerController, VRZO_CLIPS, vrzoAsset } from './vrzoBanner'

const msg = (id: string, phase: 'start' | 'stop' = 'start', extra = {}) => ({
  id, phase, clipId: 'kill_01', event: 'kill', session_epoch: 3, preview: false,
  expires_at_ms: 6000, ...extra,
})

describe('VRZO visual lifecycle', () => {
  it('does not blend across scopes and lets a matching old hard stop remove only outgoing', () => {
    const update = vi.fn(), c = new VrzoBannerController(update)
    c.receive(msg('1'), 3, 1000)
    c.receive(msg('2'), 3, 1000)
    c.receive(msg('1', 'stop'), 3, 1000)
    expect(update.mock.lastCall?.[0]?.id).toBe('2')
    expect(update.mock.lastCall?.[0]?.outgoing).toBeUndefined()
    c.receive(msg('3', 'start', { preview: true, session_epoch: 0 }), null, 1000)
    expect(update.mock.lastCall?.[0]?.outgoing).toBeUndefined()
    c.destroy()
  })
  it('fades a preempted layer while a new banner starts immediately, with at most one outgoing', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const update = vi.fn(), c = new VrzoBannerController(update)
    c.receive(msg('1'), 3, Date.now())
    c.receive({ ...msg('1'), phase: 'retire' }, 3, Date.now())
    expect(update.mock.lastCall?.[0]?.exiting).toBe(true)
    c.receive(msg('2'), 3, Date.now())
    expect(update.mock.lastCall?.[0]?.id).toBe('2')
    expect(update.mock.lastCall?.[0]?.outgoing?.id).toBe('1')
    c.receive(msg('3'), 3, Date.now())
    expect(update.mock.lastCall?.[0]?.outgoing?.id).toBe('2')
    expect(update.mock.lastCall?.[0]?.outgoing?.outgoing).toBeUndefined()
    c.fail('1')
    expect(update.mock.lastCall?.[0]?.id).toBe('3')
    vi.advanceTimersByTime(300)
    expect(update.mock.lastCall?.[0]?.id).toBe('3')
    expect(update.mock.lastCall?.[0]?.outgoing).toBeUndefined()
    c.clear(); c.destroy(); vi.useRealTimers()
  })
  it('renders admitted ID video through ID-only route and keeps lifecycle fencing', () => {
    const update = vi.fn(); const c = new VrzoBannerController(update)
    const banner = 'bnr_5984c525-b54a-5bf7-aca7-cbdd7d19cd95'
    const pack = 'ann_c4d92f17-167a-504b-9393-64fd959981cd'
    const value = msg('1', 'start', { clipId: banner, manifestVisual: { packId: pack, bannerId: banner, revision: '4' } })
    expect(c.receive(value, 3, 1000)).toBe(true)
    expect(update.mock.lastCall?.[0]?.url).toBe(`http://g-announcer-video.localhost/${pack}/${banner}/4`)
    c.receive({ ...value, phase: 'stop' }, 3, 1001)
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.destroy()
  })
  it('rejects manifest URLs, path escapes and mismatched IDs', () => {
    const update = vi.fn(); const c = new VrzoBannerController(update)
    for (const manifestVisual of [
      { packId: '../secret', bannerId: 'kill_01', revision: '4' },
      { url: 'https://example.com/track.webm' },
      { packId: 'ann_c4d92f17-167a-504b-9393-64fd959981cd', bannerId: 'bnr_5984c525-b54a-5bf7-aca7-cbdd7d19cd95', revision: '4' },
    ]) c.receive(msg('1', 'start', { manifestVisual }), 3, 1000)
    expect(update).not.toHaveBeenCalled()
  })
  it('permits only explicit clip and event combinations', () => {
    expect(vrzoAsset('kill_06', 'kill')).toBe('/vrzo-banners/kill_06.webm')
    expect(vrzoAsset('kill_07', 'kill')).toBeNull()
    expect(vrzoAsset('../kill_01', 'kill')).toBeNull()
    expect(vrzoAsset('kill_01', 'triple_kill')).toBeNull()
  })
  it('maps all 21 configured clips across 15 events, rejecting substitutions', () => {
    const events = ['match_start', 'first_blood', 'double_kill', 'triple_kill', 'ultra_kill', 'rampage', 'killing_spree', 'dominating', 'mega_kill', 'unstoppable', 'wicked_sick', 'monster_kill', 'godlike', 'beyond_godlike', 'kill']
    let count = 0
    for (const event of events) {
      const variants = event === 'kill' ? 6 : event === 'beyond_godlike' ? 2 : 1
      for (let n = 1; n <= variants; n++) {
        const clip = `${event}_${String(n).padStart(2, '0')}`
        expect(vrzoAsset(clip, event)).toBe(`/vrzo-banners/${clip}.webm`)
        expect(vrzoAsset(clip, 'first_blood' === event ? 'kill' : 'first_blood')).toBeNull()
        count++
      }
    }
    expect(count).toBe(21)
    expect(VRZO_CLIPS).toHaveLength(21)
    expect(new Set(VRZO_CLIPS.map(({ event }) => event)).size).toBe(15)
    for (const { event, clipId } of VRZO_CLIPS) expect(vrzoAsset(clipId, event)).not.toBeNull()
  })
  it('rejects wrong session, invalid, expired and stale events; old stop cannot hide newer clip', () => {
    const update = vi.fn(); const c = new VrzoBannerController(update)
    c.receive(msg('1', 'start', { session_epoch: 2 }), 3, 1000)
    c.receive(msg('invalid'), 3, 1000)
    c.receive(msg('1', 'start', { expires_at_ms: 999 }), 3, 1000)
    expect(update).not.toHaveBeenCalled()
    c.receive(msg('2'), 3, 1000)
    c.receive(msg('3', 'start', { clipId: 'kill_02' }), 3, 1000)
    c.receive(msg('2', 'stop'), 3, 1000)
    expect(update).toHaveBeenCalledTimes(3)
    expect(update.mock.lastCall?.[0]?.id).toBe('3')
    c.receive(msg('3', 'stop'), 3, 1000)
    expect(update.mock.lastCall?.[0]?.id).toBe('3')
    c.receive(msg('3', 'stop', { clipId: 'kill_02' }), 3, 1000)
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.receive(msg('3'), 3, 1000)
    expect(update.mock.lastCall?.[0]).toBeNull()
  })
  it('handles stop-before-start and isolates preview from live session authority', () => {
    const update = vi.fn(); const c = new VrzoBannerController(update)
    c.receive(msg('5', 'stop'), 3, 1000)
    c.receive(msg('5'), 3, 1000)
    expect(update).not.toHaveBeenCalled()
    c.receive(msg('6', 'start', { preview: true, session_epoch: 0 }), null, 1000)
    expect(update.mock.lastCall?.[0]?.preview).toBe(true)
    c.receive(msg('7', 'start', { session_epoch: 1 }), 3, 1000)
    expect(update.mock.lastCall?.[0]?.id).toBe('6')
    c.receive(msg('8'), 3, 1000)
    c.receive(msg('6', 'stop', { preview: true, session_epoch: 0 }), 3, 1000)
    expect(update.mock.lastCall?.[0]?.id).toBe('8')
  })
  it('expires and clears idempotently while fencing late events', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const update = vi.fn(); const c = new VrzoBannerController(update)
    c.receive(msg('9'), 3, Date.now())
    vi.advanceTimersByTime(5000)
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.receive(msg('9'), 3, Date.now())
    c.clear(); c.destroy(); vi.useRealTimers()
  })
  it('allows bounded decode grace without duplicate completion extending the outro', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const update = vi.fn(); const c = new VrzoBannerController(update)
    c.receive(msg('10'), 3, Date.now())
    c.receive({ ...msg('10'), phase: 'completed' }, 3, Date.now())
    vi.advanceTimersByTime(700)
    c.receive({ ...msg('10'), phase: 'completed' }, 3, Date.now())
    vi.advanceTimersByTime(3499)
    expect(update.mock.lastCall?.[0]?.id).toBe('10')
    vi.advanceTimersByTime(1)
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.receive(msg('11', 'start', { expires_at_ms: 10000 }), 3, Date.now())
    c.receive({ ...msg('11'), phase: 'completed' }, 3, Date.now())
    c.receive(msg('12', 'start', { expires_at_ms: 10000 }), 3, Date.now())
    vi.advanceTimersByTime(3200)
    expect(update.mock.lastCall?.[0]?.id).toBe('12')
    c.receive(msg('12', 'stop'), 3, Date.now())
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.destroy(); vi.useRealTimers()
  })
  it('completion cannot renew the original absolute expiry or override a critical stop', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const update = vi.fn(), c = new VrzoBannerController(update)
    c.receive(msg('20', 'start', { expires_at_ms: 16000 }), 3, Date.now())
    vi.advanceTimersByTime(14000)
    c.receive({ ...msg('20'), phase: 'completed', expires_at_ms: 30000 }, 3, Date.now())
    vi.advanceTimersByTime(999)
    expect(update.mock.lastCall?.[0]?.id).toBe('20')
    vi.advanceTimersByTime(1)
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.receive(msg('21', 'start', { expires_at_ms: 25000 }), 3, Date.now())
    c.receive({ ...msg('21'), phase: 'completed' }, 3, Date.now())
    c.receive(msg('21', 'stop'), 3, Date.now())
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.destroy(); vi.useRealTimers()
  })
  it('normal media end clears within grace and a late old end cannot clear the next banner', () => {
    const update = vi.fn(), c = new VrzoBannerController(update)
    c.receive(msg('30'), 3, 1000)
    c.receive({ ...msg('30'), phase: 'completed' }, 3, 1000)
    c.fail('30')
    expect(update.mock.lastCall?.[0]).toBeNull()
    c.receive(msg('31'), 3, 1100)
    c.fail('30')
    expect(update.mock.lastCall?.[0]?.id).toBe('31')
    c.destroy()
  })
})
