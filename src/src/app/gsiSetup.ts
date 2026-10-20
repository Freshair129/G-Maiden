import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { SetupStatus } from './types'

const DOTA_INSTALL_PATH_KEY = 'gm-dota-install-path'

export function savedDotaInstallPath(): string | null {
  try { return localStorage.getItem(DOTA_INSTALL_PATH_KEY) } catch { return null }
}

export function saveDotaInstallPath(path: string | null): void {
  try {
    if (path) localStorage.setItem(DOTA_INSTALL_PATH_KEY, path)
    else localStorage.removeItem(DOTA_INSTALL_PATH_KEY)
  } catch { /* local preference is optional */ }
}

export function detectGsiSetup(dotaInstallPath: string | null): Promise<SetupStatus> {
  return invoke<SetupStatus>('detect_gsi_setup', { dotaInstallPath })
}

export function installGsiConfig(dotaInstallPath: string | null): Promise<SetupStatus> {
  return invoke<SetupStatus>('install_gsi_config', { dotaInstallPath })
}

export async function chooseDotaInstallPath(currentPath: string | null): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'เลือกโฟลเดอร์ Dota 2 beta',
    ...(currentPath ? { defaultPath: currentPath } : {}),
  })
  return typeof selected === 'string' ? selected : null
}
