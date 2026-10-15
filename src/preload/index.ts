import { contextBridge, ipcRenderer } from 'electron'
import type { DeviceStatus, F75Api, LightingState, MacroErrors } from '@shared/types'

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
  readOnboard: () => ipcRenderer.invoke('f75:readOnboard'),
  writeOnboard: (changes) => ipcRenderer.invoke('f75:writeOnboard', changes),
  getPreferences: () => ipcRenderer.invoke('f75:getPreferences'),
  setPreferences: (patch) => ipcRenderer.invoke('f75:setPreferences', patch),
  getMacroErrors: () => ipcRenderer.invoke('f75:getMacroErrors'),
  onMacroErrors: (cb) => {
    const listener = (_e: unknown, errors: MacroErrors) => cb(errors)
    ipcRenderer.on('f75:macroErrors', listener)
    return () => ipcRenderer.removeListener('f75:macroErrors', listener)
  },
  suspendMacros: () => ipcRenderer.invoke('f75:suspendMacros'),
  resumeMacros: () => ipcRenderer.invoke('f75:resumeMacros'),
  hasAccessibility: () => ipcRenderer.invoke('f75:hasAccessibility'),
  requestAccessibility: () => ipcRenderer.invoke('f75:requestAccessibility'),
}

contextBridge.exposeInMainWorld('f75', api)
