import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TFunction } from 'i18next'
import { LocalizedError } from '@shared/i18n'
import type { DeviceStatus, RGB } from '@shared/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const modelName = (status: DeviceStatus, t: TFunction) =>
  status.modelName ?? t('app.status.unknownModel', { id: `0x${(status.modelId ?? 0).toString(16).toUpperCase()}` })

/** Shows a thrown error in the current language when it carries a translation key. */
export function errorText(err: unknown, t: TFunction): string {
  if (err instanceof LocalizedError) return t(err.key, err.params)
  return err instanceof Error ? err.message : String(err)
}
