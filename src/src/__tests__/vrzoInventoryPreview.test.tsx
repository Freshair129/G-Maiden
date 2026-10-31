// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import VoiceInventory from '../VoiceInventory'
const { invoke, open } = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
it('does not offer embedded variants for a legacy pack', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const pack = { id:'legacy', name:'Legacy', version:'1', locale:'th', author:'', description:'', path:'', coveredEvents:0, totalEvents:24, clips:0, availableClips:[], availableBanners:[], coverImage:'', coverImageUrl:null, builtIn:false, items:[] }
  invoke.mockReset().mockResolvedValue({rootDir:'',packsDir:'',cacheDir:'',activePackId:null,activePack:null,packs:[pack],groups:[]})
  const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el)
  await act(async()=>{root.render(<VoiceInventory />)})
  expect(el.querySelector('[aria-label="Announcer variant"]')).toBeNull()
  await act(async()=>{root.unmount()});el.remove()
})

it('uses only manifest sound IDs for preview and excludes folder import', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const id = 'snd_73de4801-07f0-57ad-82ef-535c8bd0e7ae'
  const pack = { id:'ann_c4d92f17-167a-504b-9393-64fd959981cd', name:'VRZO ID', version:'2', locale:'th', author:'', description:'', path:'', coveredEvents:1, totalEvents:15, clips:1, availableClips:[], availableBanners:[], coverImage:'', coverImageUrl:null, builtIn:false, items:[{id:'double_kill', mapping:{clips:[`audio/${id}.wav`]}}] }
  invoke.mockReset().mockResolvedValue({authoringEnabled:true,rootDir:'',packsDir:'',cacheDir:'',activePackId:pack.id,activePack:pack,packs:[pack],groups:[]})
  const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el)
  await act(async()=>{root.render(<VoiceInventory />)})
  expect(el.querySelector('[aria-label="Announcer folder"]')).toBeNull()
  const select=el.querySelector<HTMLSelectElement>('[aria-label="Announcer variant"]')!
  expect(select.options.length).toBe(1)
  expect(select.value).toBe(id)
  await act(async()=>{el.querySelector<HTMLButtonElement>('[aria-label="Preview Announcer variant"]')!.click()})
  expect(invoke).toHaveBeenCalledWith('preview_announcer_variant',{event:'double_kill',clipId:id,packId:pack.id})
  await act(async()=>{root.unmount()});el.remove()
})

it('imports a local container in consumer mode without equipping it automatically', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const state={authoringEnabled:false,rootDir:'',packsDir:'',cacheDir:'',activePackId:null,activePack:null,packs:[],groups:[]}
  open.mockResolvedValue('D:/pack.gann')
  invoke.mockReset().mockImplementation((cmd:string)=>Promise.resolve(cmd==='voice_api_state'?state:cmd==='voice_api_import_file'?{imported:['ann_test']}:undefined))
  const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el)
  await act(async()=>{root.render(<VoiceInventory />)})
  expect(el.querySelector('[aria-label="Announcer folder"]')).toBeNull()
  await act(async()=>{[...el.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='นำเข้า .gann')!.click()})
  expect(invoke).toHaveBeenCalledWith('voice_api_import_file',{path:'D:/pack.gann'})
  expect(invoke.mock.calls.some(([cmd])=>cmd==='voice_api_action')).toBe(false)
  expect(el.textContent).toContain('นำเข้าแพ็ก local .gann แล้ว')
  await act(async()=>root.unmount());el.remove()
})
