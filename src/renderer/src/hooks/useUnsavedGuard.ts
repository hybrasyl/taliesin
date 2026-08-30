import { useState, useRef, useCallback, useEffect, useId } from 'react'
import { useUiStore, type DirtyEditor } from '../store/uiStore'
import { reportUnsaved } from '../utils/unsavedReport'

interface UseUnsavedGuardReturn {
  markDirty: () => void
  markClean: () => void
  saveRef: React.MutableRefObject<(() => Promise<void>) | null>
  guard: (action: () => void) => void
  dialogOpen: boolean
  handleDialogSave: () => Promise<void>
  handleDialogDiscard: () => void
  handleDialogCancel: () => void
}

/**
 * Provides within-page unsaved-changes guard (file switch / New) and registers
 * the dirty state globally so App.tsx can intercept cross-page navigation.
 *
 * Usage in a page:
 *   const { markDirty, markClean, saveRef, guard, dialogOpen,
 *           handleDialogSave, handleDialogDiscard, handleDialogCancel } = useUnsavedGuard('Map')
 *
 *   const handleSelect = (file) => guard(() => loadFile(file))
 *   const handleNew    = ()     => guard(() => openNewForm())
 *   markClean() // call after save / archive / unarchive
 */
export interface UnsavedGuardOptions {
  /**
   * Register the dirty state globally so navigation away prompts. Default
   * true. A page that is kept mounted across navigation (the XML map editor)
   * passes false: its edits survive the trip, so the prompt would only offer
   * to discard state that is not going anywhere. The within-page guard
   * (switching maps, New) is unaffected.
   */
  navigationGuard?: boolean
}

export function useUnsavedGuard(
  label: string,
  options: UnsavedGuardOptions = {}
): UseUnsavedGuardReturn {
  const navigationGuard = options.navigationGuard ?? true
  const closeGuardId = useId()
  const setDirtyEditorRaw = useUiStore((s) => s.setDirtyEditor)
  const setDirtyEditor = useCallback(
    (editor: DirtyEditor | null) => {
      if (navigationGuard) setDirtyEditorRaw(editor)
    },
    [navigationGuard, setDirtyEditorRaw]
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const pendingActionRef = useRef<(() => void) | null>(null)
  const saveRef = useRef<(() => Promise<void>) | null>(null)
  const isDirtyRef = useRef(false)
  const registeredRef = useRef<DirtyEditor | null>(null)

  const markDirty = useCallback(() => {
    if (isDirtyRef.current) return
    isDirtyRef.current = true
    const entry: DirtyEditor = {
      label,
      onSave: async () => {
        await saveRef.current?.()
      }
    }
    registeredRef.current = entry
    setDirtyEditor(entry)
    reportUnsaved()
  }, [label, setDirtyEditor])

  /**
   * Drop the global registration when the editor goes away.
   *
   * `dirtyEditor` is a single slot that outlives the page that set it, so an
   * editor unmounting while dirty — the Discard path, or any unmount that
   * doesn't run markClean — would leave a phantom guard behind that blocks the
   * *next* navigation and offers to save a component that no longer exists.
   * Identity-checked so a page that mounts before this one tears down can't
   * have its own registration cleared.
   */
  useEffect(
    () => () => {
      if (useUiStore.getState().dirtyEditor === registeredRef.current) setDirtyEditor(null)
    },
    [setDirtyEditor]
  )

  /**
   * Answer for this editor when the window closes. Registered for the hook's
   * whole life, whatever `navigationGuard` says: the navigation prompt is
   * about a page going away, the close guard is about work going away, and
   * a kept-alive page has only the second problem. Reads the refs at close
   * time, so it is never stale and never needs re-registering.
   */
  useEffect(() => {
    const { registerCloseGuard, unregisterCloseGuard } = useUiStore.getState()
    registerCloseGuard(closeGuardId, {
      label,
      isDirty: () => isDirtyRef.current,
      onSave: async () => {
        await saveRef.current?.()
      }
    })
    return () => {
      unregisterCloseGuard(closeGuardId)
      // An editor that unmounts dirty (Discard) takes its work with it.
      reportUnsaved()
    }
  }, [closeGuardId, label])

  const markClean = useCallback(() => {
    isDirtyRef.current = false
    registeredRef.current = null
    setDirtyEditor(null)
    reportUnsaved()
  }, [setDirtyEditor])

  const guard = useCallback((action: () => void) => {
    if (!isDirtyRef.current) {
      action()
      return
    }
    pendingActionRef.current = action
    setDialogOpen(true)
  }, [])

  const handleDialogSave = useCallback(async () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    setDialogOpen(false)
    try {
      await saveRef.current?.()
    } catch {
      return
    }
    action?.()
  }, [])

  const handleDialogDiscard = useCallback(() => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    setDialogOpen(false)
    markClean()
    action?.()
  }, [markClean])

  const handleDialogCancel = useCallback(() => {
    pendingActionRef.current = null
    setDialogOpen(false)
  }, [])

  return {
    markDirty,
    markClean,
    saveRef,
    guard,
    dialogOpen,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel
  }
}
