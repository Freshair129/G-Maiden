import type { GsiStatus, SetupStatus } from './types'

export const OAUTH_CALLBACK_PORT = 3000
export type StageState = 'ok' | 'pending' | 'blocked' | 'unknown'

type Stage = 'configExists' | 'configValid' | 'listening' | 'waiting' | 'live'
type GsiSetupHealth = {
  stages: Record<Stage, { state: StageState; text: string }>
  oauthCallback: { state: 'ready' | 'blocked' | 'unknown'; text: string }
  remediation: string[]
}

const restartDota = 'ปิดแล้วเปิด Dota 2 เพื่อโหลด config ใหม่'

export function buildGsiSetupHealth(setup: SetupStatus | null, health: GsiStatus | null): GsiSetupHealth {
  const stages: GsiSetupHealth['stages'] = {
    configExists: { state: 'unknown', text: 'ไฟล์ GSI config: ยังไม่มีผลตรวจ' },
    configValid: { state: 'unknown', text: 'ความถูกต้องของ config: ยังไม่มีผลตรวจ' },
    listening: { state: 'unknown', text: 'พอร์ต GSI: ยังไม่มีสถานะตัวรับข้อมูล' },
    waiting: { state: 'unknown', text: 'การส่งข้อมูลจาก Dota 2: ยังไม่มีสถานะ' },
    live: { state: 'unknown', text: 'ข้อมูลสด: ยังไม่มีสถานะ GSI' },
  }
  let oauthCallback: GsiSetupHealth['oauthCallback'] = {
    state: 'unknown', text: 'ลงชื่อเข้าใช้ Google: ยังไม่ทราบสถานะพอร์ต 3000',
  }
  const remediation: string[] = []

  if (setup) {
    stages.configExists = setup.cfg_present
      ? { state: 'ok', text: 'ไฟล์ GSI config: พบไฟล์แล้ว' }
      : { state: 'pending', text: 'ไฟล์ GSI config: ยังไม่ได้ติดตั้ง' }
    stages.configValid = setup.installed && setup.cfg_valid
      ? { state: 'ok', text: 'ความถูกต้องของ config: GSI config ถูกต้อง' }
      : setup.cfg_present
        ? { state: 'blocked', text: 'ความถูกต้องของ config: ยังไม่ผ่านการตรวจ กดซ่อม GSI config' }
        : { state: 'pending', text: 'ความถูกต้องของ config: รอติดตั้ง GSI config' }
    if (!setup.dota_cfg_dir) {
      remediation.push('เลือกโฟลเดอร์ Dota 2 beta ที่มี game\\bin\\win64\\dota2.exe อยู่ด้านใน ระบบจะเขียนเฉพาะ GSI config ในโฟลเดอร์เกมนี้')
    } else if (stages.configValid.state !== 'ok') {
      remediation.push(`หลังติดตั้งหรือซ่อม: ${restartDota}`)
    }
  }

  if (health) {
    const port = health.gsi_port ?? OAUTH_CALLBACK_PORT
    switch (health.server_state) {
      case 'listening':
        stages.listening = { state: 'ok', text: `พอร์ต GSI: 127.0.0.1:${port} · พร้อมรับข้อมูล GSI` }
        oauthCallback = port === OAUTH_CALLBACK_PORT
          ? { state: 'ready', text: 'พอร์ตพร้อมสำหรับลงชื่อเข้าใช้ Google: 3000' }
          : { state: 'blocked', text: `ลงชื่อเข้าใช้ Google ไม่ได้: ต้องใช้พอร์ต 3000; GSI ยังทำงานบนพอร์ต ${port} — ปิดแอปที่ใช้พอร์ต 3000 แล้วเปิด G-Maiden ใหม่` }
        if (oauthCallback.state === 'blocked') {
          remediation.push('ปิด G-Maiden ที่เปิดซ้ำหรือแอปที่ใช้พอร์ต 3000 แล้วเปิด G-Maiden ใหม่เพื่อใช้ Google')
        }
        break
      case 'starting':
        stages.listening = { state: 'pending', text: 'พอร์ต GSI: กำลังเริ่มตัวรับข้อมูล…' }
        break
      case 'port_conflict':
        stages.listening = { state: 'blocked', text: 'พอร์ต GSI: พอร์ต 3000–3010 ถูกใช้งานทั้งหมด' }
        oauthCallback = { state: 'blocked', text: 'ลงชื่อเข้าใช้ Google ไม่ได้: ตัวรับข้อมูลยังเปิดพอร์ต 3000 ไม่ได้' }
        break
      case 'bind_error':
        stages.listening = { state: 'blocked', text: 'พอร์ต GSI: เปิดตัวรับข้อมูลไม่สำเร็จ' }
        oauthCallback = { state: 'blocked', text: 'ลงชื่อเข้าใช้ Google ไม่ได้: เปิดตัวรับข้อมูลบนพอร์ต 3000 ไม่สำเร็จ' }
        break
    }

    if (!health.dota_running) {
      stages.waiting = { state: 'pending', text: 'การส่งข้อมูลจาก Dota 2: รอเปิด Dota 2' }
    } else if (health.server_state !== 'listening') {
      stages.waiting = { state: 'pending', text: 'การส่งข้อมูลจาก Dota 2: รอตัวรับ GSI พร้อมรับข้อมูล' }
    } else if (health.gsi_freshness === 'fresh' || health.gsi_freshness === 'stale') {
      stages.waiting = { state: 'ok', text: 'การส่งข้อมูลจาก Dota 2: ได้รับข้อมูล GSI แล้ว' }
    } else {
      stages.waiting = { state: 'pending', text: `การส่งข้อมูลจาก Dota 2: เปิดเกมแล้ว แต่ยังรอข้อมูล GSI — หลังติดตั้งหรือซ่อม config ให้${restartDota}` }
    }

    if (health.gsi_freshness === 'fresh') {
      stages.live = { state: 'ok', text: 'ข้อมูลสด: ได้รับข้อมูล GSI ล่าสุดแล้ว' }
    } else if (health.gsi_freshness === 'stale') {
      const age = health.gsi_age_ms == null ? '' : ` ${(health.gsi_age_ms / 1000).toFixed(1)} วินาที`
      stages.live = { state: 'blocked', text: `ข้อมูลสด: GSI ล้าสมัย${age} — พักข้อสรุปจากสถานะผู้เล่นจนกว่าจะได้รับข้อมูลใหม่` }
    } else {
      stages.live = { state: 'pending', text: 'ข้อมูลสด: รอข้อมูล GSI ล่าสุด' }
    }

    if (health.server_state === 'port_conflict' || health.server_state === 'bind_error') {
      remediation.push('ปิด G-Maiden ที่เปิดซ้ำหรือแอปที่ใช้พอร์ต 3000–3010 ระบบจะลองเปิดตัวรับข้อมูลใหม่อัตโนมัติทุก 3 วินาที')
    }
    if (health.dota_restart_required) remediation.push(`พอร์ต GSI เปลี่ยนแล้ว — ${restartDota}`)
  }

  return { stages, oauthCallback, remediation }
}
