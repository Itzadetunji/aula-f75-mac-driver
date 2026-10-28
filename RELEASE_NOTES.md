# AULA F75 Mac Driver 0.3.0

Changes since 0.2.0.

## Lighting

- Per-key colours now reach the keyboard reliably (queued HID frames so single-key updates are no longer dropped while a write is in flight)
- Click a key to paint it with the current colour; drag to paint a group; click again to turn a key off
- Shift / ⌘-click still multi-selects without painting so you can recolour a selection from the swatches

## Menu bar

- **Allow Fn shortcuts (3s)** temporarily stops live lighting so on-keyboard Fn feedback works (e.g. Fn+B battery check) without quitting the app

# AULA F75 Mac Driver 0.2.0

Changes since 0.1.0.

## Music

- Keeps running while the display sleeps (Core Audio taps on macOS 14.2+)
- Recovers automatically after the display sleeps, the screen locks or the Mac wakes
- Restarts when the output device changes (e.g. headphones plugged in)
- Asks for system audio recording permission only, no screen recording on macOS 14.2+

## Fixes

- "Audio capture stopped" alert no longer sticks around once Music is streaming again
- Helper no longer throttled by App Nap while streaming lighting or Music

## Settings

- Keep the display awake while Music is on (on by default, only used before macOS 14.2)

## Languages

- French, Spanish and Chinese translations

# AULA F75 Mac Driver 0.1.0

## Lighting

- Live effects: On-board, Static, Breathing, Spectrum, Wave, Music, Per-key, Off
- Music visualiser with Horizontal, Heat bars and Rainbow bars styles
- Music streams from Mac system audio (no microphone)
- Music works over USB cable and 2.4 GHz dongle
- Saved-on-keyboard effects: select and edit brightness, speed and colour
- Changes to saved effects apply automatically (no Save button)
- Unsupported onboard effects hidden outside development builds
- Saved tab re-reads the keyboard every 1 second
- Per-key colour painting with multi-select

## Connectivity

- USB cable support for lighting, saved effects and keyboard settings
- 2.4 GHz dongle support for live lighting and Music
- Dongle keepalive so lighting does not flip back to the keyboard's own effect
- Cable required for writing saved effects, sleep and debounce

## Macros

- Global shortcuts that type text anywhere on macOS
- Optional Return after typing
- Enable / disable per macro
- Import from `.json`, `.txt` and `.md`
- Export to `.json`

## Settings

- Device info: model, firmware version, connection type, app version
- Language: English, French, Spanish, Chinese (locale files ready for translation)
- Close window: keep running in the menu bar (default) or quit
- Pause / resume: stops live lighting, Music and macros
- Sleep timer (cable only)
- Debounce slider (cable only; write enabled once offset is verified)

## Menu bar

- Native Swift menu bar item labelled AULA
- Pause / resume from the menu
- Switch lighting modes with icons
- Open window and Quit

## App

- First-run setup for right-side key layout
- Layout tab: LED map check and right-side key configuration
- Protocol lab (development builds only)
- App icon and branding
- DMG packaging via `bun run dist`
