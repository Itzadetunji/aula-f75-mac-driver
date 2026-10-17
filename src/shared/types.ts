import { DEFAULT_RIGHT_COLUMN, type RightColumn } from './layout'
import type { Macro } from './macros'

export type RGB = [number, number, number]

export type Language = 'en' | 'fr' | 'es' | 'zh'

/** What closing the window does: keep running in the menu bar, or quit the app. */
export type CloseAction = 'menubar' | 'quit'

export interface Preferences {
  onboarded: boolean
  rightColumn: RightColumn
  macros: Macro[]
  language: Language
  closeAction: CloseAction
  /** false = paused: the app's lighting and macros are off and the keyboard shows its own effect. */
  running: boolean
  /** Keep the display awake while Music streams, since capture stops when it sleeps. */
  keepAwakeForMusic: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  onboarded: false,
  rightColumn: DEFAULT_RIGHT_COLUMN,
  macros: [],
  language: 'en',
  closeAction: 'menubar',
  running: true,
  keepAwakeForMusic: true,
}

/** Macro id -> translation key of the reason it couldn't be registered. */
export type MacroErrors = Record<string, string>

export type EffectId = 'hardware' | 'off' | 'static' | 'breathing' | 'spectrum' | 'wave' | 'music' | 'custom'

export type MusicStyle = 'horizontal' | 'heat' | 'rainbow'

export interface LightingState {
  effect: EffectId
  musicStyle: MusicStyle
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
  /** 'wireless' = through the 2.4 GHz dongle, which only carries live lighting. */
  transport: 'wired' | 'wireless'
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
  /** Live spectrum of the Mac's audio output (one 0–1 level per keyboard column) while the Music effect runs. */
  onAudio(cb: (bands: number[]) => void): () => void
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
  /** Patch keyboard-wide settings (sleep, debounce) on the stored page; returns the page as read back. */
  writeKeyboardSettings(changes: [number, number][]): Promise<number[]>
  /** Fires when lighting is changed outside the window (e.g. from the menu bar). */
  onLighting(cb: (state: LightingState) => void): () => void
  getPreferences(): Promise<Preferences>
  setPreferences(patch: Partial<Preferences>): Promise<Preferences>
  onPreferences(cb: (preferences: Preferences) => void): () => void
  getAppVersion(): Promise<string>
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
  musicStyle: 'horizontal',
  color: [0, 170, 255],
  brightness: 80,
  speed: 50,
  perKey: {},
}
