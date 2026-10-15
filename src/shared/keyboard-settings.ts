/**
 * Keyboard-wide settings stored on the same 128-byte page as the lighting
 * (see onboard.ts). Only writable over the USB cable.
 */

/** Idle time before the backlight sleeps, stored in 30-second units; 0 = never. */
export const SLEEP_OFFSET = 0x18
/** The timer lengths the vendor driver offers, in seconds. */
export const SLEEP_SECONDS = [60, 90, 120, 180, 240, 300, 600, 900, 1200]
export const DEFAULT_SLEEP_SECONDS = 300

export const sleepToByte = (seconds: number) => seconds / 30
/** null when the stored value isn't one the vendor driver uses. */
export function sleepFromByte(value: number): { enabled: boolean; seconds: number } | null {
  if (value === 0) return { enabled: false, seconds: DEFAULT_SLEEP_SECONDS }
  const seconds = value * 30
  return SLEEP_SECONDS.includes(seconds) ? { enabled: true, seconds } : null
}

/**
 * Key debounce, stored as milliseconds - 1 (1–5 ms). The offset is not
 * confirmed yet, so the control stays read-only until it is set here and in
 * the helper's write whitelist.
 */
export const DEBOUNCE_OFFSET: number | null = null
export const DEBOUNCE_MIN_MS = 1
export const DEBOUNCE_MAX_MS = 5
export const DEFAULT_DEBOUNCE_MS = 2

export const debounceToByte = (ms: number) => ms - 1
export const debounceFromByte = (value: number) =>
  value + 1 >= DEBOUNCE_MIN_MS && value + 1 <= DEBOUNCE_MAX_MS ? value + 1 : null

export function formatDuration(seconds: number, t: (key: string, params?: Record<string, unknown>) => string) {
  return seconds < 60 || seconds % 60 !== 0
    ? t('settings.sleep.seconds', { count: seconds })
    : t('settings.sleep.minutes', { count: seconds / 60 })
}
