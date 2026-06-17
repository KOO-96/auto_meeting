import type { ElectronAPI } from '@/types/electron'

export function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI ?? null
}

export function requireElectronAPI(): ElectronAPI {
  const api = getElectronAPI()

  if (!api) {
    throw new Error('Electron preload API를 사용할 수 없습니다.')
  }

  return api
}

