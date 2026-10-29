// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import VoiceInventory from '../VoiceInventory'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
it('previews an exact VRZO variant using the native admitted audio path', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const pack = { id:'pack_vrzo_20261028', name:'VRZO', version:'0.2.0', locale:'th', author:'', description:'', path:'', coveredEvents:1, totalEvents:15, clips:21, availableClips:[], availableBanners:[], coverImage:'', coverImageUrl:null, builtIn:false, items:[] }
  invoke.mockReset().mockImplementation((cmd:string) => Promise.resolve(cmd === 'voice_api_state' ? {rootDir:'',packsDir:'',cacheDir:'',activePackId:pack.id,activePack:pack,packs:[pack],groups:[]} : undefined))
  const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el)
  await act(async()=>{root.render(<VoiceInventory />)})
  const select=el.querySelector<HTMLSelectElement>('[aria-label="VRZO variant"]')!
  expect(select.options.length).toBe(21)
  await act(async()=>{select.value='kill_05';select.dispatchEvent(new Event('change',{bubbles:true}))})
  await act(async()=>{el.querySelector<HTMLButtonElement>('[aria-label="Preview VRZO variant"]')!.click()})
  expect(invoke).toHaveBeenCalledWith('preview_vrzo_banner_variant',{event:'kill',clipId:'kill_05'})
  await act(async()=>{root.unmount()});el.remove()
})
