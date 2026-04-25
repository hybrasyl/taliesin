import { useState, useRef, useCallback } from 'react'
import { useRecoilState } from 'recoil'
import { dirtyEditorState } from '../recoil/atoms'

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
export function useUnsavedGuard(label: string): UseUnsavedGuardReturn {
  const [, setDirtyEditor] = useRecoilState(dirtyEditorState)
  const [dialogOpen, setDialogOpen] = useState(false)

  const pendingActionRef = useRef<(() => void) | null>(null)
  const saveRef = useRef<(() => Promise<void>) | null>(null)
  const isDirtyRef = useRef(false)

  const markDirty = useCallback(() => {
    if (isDirtyRef.current) return
    isDirtyRef.current = true
    setDirtyEditor({
      label,
      onSave: async () => {
        await saveRef.current?.()
      }
    })
  }, [label, setDirtyEditor])

  const markClean = useCallback(() => {
    isDirtyRef.current = false
    setDirtyEditor(null)
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
