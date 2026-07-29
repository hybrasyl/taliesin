import React, { type ReactNode } from 'react'
import {
  useSettingsStore,
  DEFAULT_SETTINGS,
  type RendererSettings
} from '../../store/settingsStore'
import { useUiStore } from '../../store/uiStore'
import { useArchiveStore } from '../../store/archiveStore'
import { resetWorldIndexStore } from '../../store/worldIndexStore'

/**
 * Test helpers for the Zustand stores. Unlike Recoil, the stores are global
 * singletons with no provider — so tests seed by writing state directly and
 * must reset between tests (call {@link resetStores} in `beforeEach`).
 */

const DEFAULT_UI = {
  currentPage: 'dashboard' as const,
  dirtyEditor: null,
  activePaletteId: null,
  activeColorizeSource: null
}

/** Reset the stores to their initial state. Call in `beforeEach`. */
export function resetStores(): void {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    libraries: [],
    mapDirectories: [],
    musicWorkingDirs: []
  })
  useUiStore.setState({ ...DEFAULT_UI })
  // Without this a prior test's open archive stays visible to the next one.
  useArchiveStore.getState().close()
  // Also clears its module-level in-flight maps. Without this a prior test's
  // `loadedFor` silently no-ops the next test's `ensure`.
  resetWorldIndexStore()
}

/** Seed settings-store fields. */
export function seedSettings(patch: Partial<RendererSettings>): void {
  useSettingsStore.setState(patch)
}

/**
 * Passthrough wrapper for `renderHook`/`render` that need a `wrapper` — no
 * provider is required for Zustand, so this just renders children.
 */
export function StoreWrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return <>{children}</>
}

/**
 * Convenience: reset the stores, apply an optional seed, and return the
 * passthrough wrapper. Mirrors the old `makeRecoilWrapper(overrides)` shape.
 */
export function makeStoreWrapper(seed?: {
  settings?: Partial<RendererSettings>
}): typeof StoreWrapper {
  resetStores()
  if (seed?.settings) useSettingsStore.setState(seed.settings)
  return StoreWrapper
}
