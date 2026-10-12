import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RGB } from '@shared/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
