import { DEFAULT_RIGHT_COLUMN, type RightColumn } from './layout'
import type { Macro } from './macros'

export type RGB = [number, number, number]

export interface Preferences {
  onboarded: boolean
  rightColumn: RightColumn
  macros: Macro[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  onboarded: false,
  rightColumn: DEFAULT_RIGHT_COLUMN,
  macros: [],
}

/** Macro id -> reason it couldn't be registered. */
export type MacroErrors = Record<string, string>

export type EffectId = 'hardware' | 'off' | 'static' | 'breathing' | 'spectrum' | 'wave' | 'custom'

export interface LightingState {
  effect: EffectId
  color: RGB
  /** 0–100 */
  brightness: number
  /** 0–100 */
  speed: number
  /** LED index -> colour, used by the "custom" effect. */
  perKey: Record<number, RGB>
}

export interface DeviceInfo {
  vendorId: number
  productId: number
  product: string
  manufacturer: string
  serial: string
  firmwareVersion: number
}

export interface DeviceStatus {
  helperRunning: boolean
  connected: boolean
  info: DeviceInfo | null
  modelId: number | null
  modelName: string | null
  error: string | null
}

export interface F75Api {
  getStatus(): Promise<DeviceStatus>
  onStatus(cb: (status: DeviceStatus) => void): () => void
  getLighting(): Promise<LightingState>
  setLighting(state: LightingState): Promise<void>
  /** Light a single LED index white (others off) to verify the key map. Pass null to stop. */
  identifyLed(led: number | null): Promise<void>
  /** Read-only protocol probe: sends a 0x82 read request with the given argument bytes. */
  rawRead(args: number[]): Promise<string>
  /** The 128-byte lighting settings page stored on the keyboard. */
  readOnboard(): Promise<number[]>
  /**
   * Patch bytes of the stored settings page; returns the page as read back.
   * Switches the app to On-board so it stops overriding the keyboard.
   */
  writeOnboard(changes: [number, number][]): Promise<number[]>
  getPreferences(): Promise<Preferences>
  setPreferences(patch: Partial<Preferences>): Promise<Preferences>
  getMacroErrors(): Promise<MacroErrors>
  onMacroErrors(cb: (errors: MacroErrors) => void): () => void
  /** Temporarily unregisters macro shortcuts so a new one can be recorded. */
  suspendMacros(): Promise<void>
  resumeMacros(): Promise<void>
  hasAccessibility(): Promise<boolean>
  requestAccessibility(): Promise<boolean>
}

export const DEFAULT_LIGHTING: LightingState = {
  effect: 'hardware',
  color: [0, 170, 255],
  brightness: 80,
  speed: 50,
  perKey: {},
}
