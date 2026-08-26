// Theming foundation.
//
// A theme is an id, a label, a colour scheme and a full set of tokens. The two
// built-ins keep their tokens in styles/themes.css, so switching them is one
// attribute write and the browser repaints with no work from us. A theme added
// at runtime carries its tokens here instead and gets written to the root
// element as inline custom properties.
//
// THEME_TOKENS is the contract. It is a const tuple, so ThemeVars is a type
// with every token required. A new theme that forgets one fails `tsc`.

import { THEME_KEY, THEME_VARS_KEY } from '../game/balance'

export const THEME_TOKENS = [
  'bg',
  'fg',
  'fg-dim',
  'fg-muted',
  'fill',
  'fill-strong',
  'selection-bg',
  'selection-fg',
  'glow',
  'accent',
  'panel',
  'chrome',
  'border',
  'border-soft',
  'border-mid',
  'border-faint',
  'scrollbar-track',
  'scanline',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]
export type ThemeVars = Record<ThemeToken, string>

export interface ThemeDef {
  id: string
  /** Shown in the picker and on the cycle button. Kept short and uppercase. */
  label: string
  scheme: 'dark' | 'light'
  /** Drives the meta theme-color, which is the browser chrome on mobile. */
  themeColor: string
  /**
   * Omitted for built-ins, whose tokens live in styles/themes.css. Present for
   * anything registered at runtime.
   */
  vars?: ThemeVars
}

const BUILT_IN: ThemeDef[] = [
  {
    id: 'modus-vivendi',
    label: 'VIVENDI',
    scheme: 'dark',
    themeColor: '#000000',
  },
  {
    id: 'modus-operandi',
    label: 'OPERANDI',
    scheme: 'light',
    themeColor: '#ffffff',
  },
]

const registry = new Map<string, ThemeDef>(BUILT_IN.map((t) => [t.id, t]))

export function themes(): ThemeDef[] {
  return [...registry.values()]
}

export function getTheme(id: string): ThemeDef | undefined {
  return registry.get(id)
}

/**
 * Register a theme at runtime. Custom themes must bring their own vars, since
 * there is no stylesheet block to fall back on.
 */
export function registerTheme(def: ThemeDef & { vars: ThemeVars }): void {
  registry.set(def.id, def)
}

export const DEFAULT_THEME = BUILT_IN[0].id

function readStoredId(): string {
  try {
    return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function currentTheme(): ThemeDef {
  const id = document.documentElement.dataset.theme ?? readStoredId()
  return registry.get(id) ?? registry.get(DEFAULT_THEME)!
}

export function applyTheme(id: string): ThemeDef {
  const def = registry.get(id) ?? registry.get(DEFAULT_THEME)!
  const root = document.documentElement

  root.dataset.theme = def.id
  root.style.colorScheme = def.scheme

  // Clear any inline tokens from a previously applied custom theme, then write
  // this one's if it has them. Built-ins fall through to the stylesheet.
  for (const t of THEME_TOKENS) root.style.removeProperty(`--${t}`)
  if (def.vars) {
    for (const t of THEME_TOKENS) root.style.setProperty(`--${t}`, def.vars[t])
  }

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', def.themeColor)

  try {
    localStorage.setItem(THEME_KEY, def.id)
    if (def.vars) localStorage.setItem(THEME_VARS_KEY, JSON.stringify(def.vars))
    else localStorage.removeItem(THEME_VARS_KEY)
  } catch {
    // A blocked localStorage costs a persisted theme and nothing else.
  }
  return def
}

/** The bar button cycles rather than toggles, so a third theme just works. */
export function nextTheme(): ThemeDef {
  const all = themes()
  const i = all.findIndex((t) => t.id === currentTheme().id)
  return applyTheme(all[(i + 1) % all.length].id)
}
