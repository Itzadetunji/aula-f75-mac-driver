import type { F75Api } from '../shared/types'

declare global {
  interface Window {
    f75: F75Api
  }
}
