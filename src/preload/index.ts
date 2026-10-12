import { contextBridge, ipcRenderer } from 'electron'
import type { DeviceStatus, F75Api, LightingState } from '@shared/types'

const api: F75Api = {
  getStatus: () => ipcRenderer.invoke('f75:getStatus'),
  onStatus: (cb) => {
    const listener = (_e: unknown, status: DeviceStatus) => cb(status)
    ipcRenderer.on('f75:status', listener)
    return () => ipcRenderer.removeListener('f75:status', listener)
  },
  getLighting: () => ipcRenderer.invoke('f75:getLighting'),
  setLighting: (state: LightingState) => ipcRenderer.invoke('f75:setLighting', state),
  identifyLed: (led) => ipcRenderer.invoke('f75:identifyLed', led),
  rawRead: (args) => ipcRenderer.invoke('f75:rawRead', args),
}

contextBridge.exposeInMainWorld('f75', api)
