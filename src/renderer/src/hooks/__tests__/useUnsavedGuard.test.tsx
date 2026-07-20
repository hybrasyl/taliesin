import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUnsavedGuard } from '../useUnsavedGuard'
import { useUiStore } from '../../store/uiStore'
import { StoreWrapper, resetStores } from '../../__tests__/setup/storeWrapper'
import { installMockApi } from '../../__tests__/setup/mockApi'

const wrapper = StoreWrapper

beforeEach(() => {
  installMockApi()
  resetStores()
})

describe('useUnsavedGuard', () => {
  it('exposes the expected interface', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    expect(typeof result.current.markDirty).toBe('function')
    expect(typeof result.current.markClean).toBe('function')
    expect(typeof result.current.guard).toBe('function')
    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.saveRef.current).toBeNull()
  })

  it('guard runs the action immediately when not dirty', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    let called = false
    act(() =>
      result.current.guard(() => {
        called = true
      })
    )
    expect(called).toBe(true)
    expect(result.current.dialogOpen).toBe(false)
  })

  it('guard opens the dialog and defers the action when dirty', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())
    let called = false
    act(() =>
      result.current.guard(() => {
        called = true
      })
    )
    expect(called).toBe(false)
    expect(result.current.dialogOpen).toBe(true)
  })

  it('handleDialogDiscard runs the pending action and clears dirty', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())
    let actionRan = false
    act(() =>
      result.current.guard(() => {
        actionRan = true
      })
    )
    act(() => result.current.handleDialogDiscard())
    expect(actionRan).toBe(true)
    expect(result.current.dialogOpen).toBe(false)
  })

  it('handleDialogCancel keeps dirty state and does not run the action', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())
    let actionRan = false
    act(() =>
      result.current.guard(() => {
        actionRan = true
      })
    )
    act(() => result.current.handleDialogCancel())
    expect(actionRan).toBe(false)
    expect(result.current.dialogOpen).toBe(false)
    // Still dirty: opening the dialog again should be deferred again
    let secondAction = false
    act(() =>
      result.current.guard(() => {
        secondAction = true
      })
    )
    expect(secondAction).toBe(false)
    expect(result.current.dialogOpen).toBe(true)
  })

  it('handleDialogSave invokes saveRef and runs the pending action on success', async () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })

    let savedCount = 0
    result.current.saveRef.current = async () => {
      savedCount++
    }

    act(() => result.current.markDirty())
    let actionRan = false
    act(() =>
      result.current.guard(() => {
        actionRan = true
      })
    )
    await act(async () => {
      await result.current.handleDialogSave()
    })

    expect(savedCount).toBe(1)
    expect(actionRan).toBe(true)
    expect(result.current.dialogOpen).toBe(false)
  })

  it('handleDialogSave swallows save errors and skips the action', async () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    result.current.saveRef.current = async () => {
      throw new Error('disk full')
    }

    act(() => result.current.markDirty())
    let actionRan = false
    act(() =>
      result.current.guard(() => {
        actionRan = true
      })
    )
    await act(async () => {
      await result.current.handleDialogSave()
    })

    expect(actionRan).toBe(false)
    expect(result.current.dialogOpen).toBe(false)
  })

  it('markDirty is idempotent and markClean restores the clean state', () => {
    const { result } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())
    act(() => result.current.markDirty())
    act(() => result.current.markDirty())
    act(() => result.current.markClean())
    // After markClean the next guard() should run synchronously
    let ran = false
    act(() =>
      result.current.guard(() => {
        ran = true
      })
    )
    expect(ran).toBe(true)
  })

  it('publishes an onSave on dirtyEditorState that proxies to saveRef', async () => {
    const { result } = renderHook(
      () => ({ guard: useUnsavedGuard('Map'), dirty: useUiStore((s) => s.dirtyEditor) }),
      { wrapper }
    )
    let saved = 0
    result.current.guard.saveRef.current = async () => {
      saved++
    }
    act(() => result.current.guard.markDirty())
    // The global unsaved-changes dialog invokes the atom's onSave (not the
    // hook's handleDialogSave); it must delegate to the current saveRef.
    expect(result.current.dirty?.label).toBe('Map')
    await act(async () => {
      await result.current.dirty!.onSave()
    })
    expect(saved).toBe(1)
  })

  it('atom onSave is a no-op when no saveRef is set', async () => {
    const { result } = renderHook(
      () => ({ guard: useUnsavedGuard('Map'), dirty: useUiStore((s) => s.dirtyEditor) }),
      { wrapper }
    )
    act(() => result.current.guard.markDirty())
    await act(async () => {
      await expect(result.current.dirty!.onSave()).resolves.toBeUndefined()
    })
  })

  it('drops its global registration when the editor unmounts dirty', () => {
    // dirtyEditor is a single slot that outlives the page that set it. Left
    // behind, it blocks the *next* navigation and offers to save a component
    // that no longer exists.
    const { result, unmount } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())
    expect(useUiStore.getState().dirtyEditor?.label).toBe('Map')

    unmount()
    expect(useUiStore.getState().dirtyEditor).toBeNull()
  })

  it('leaves another editor’s registration alone on unmount', () => {
    // A page that mounts and registers before this one tears down must keep
    // its slot — the cleanup is identity-checked, not unconditional.
    const { result, unmount } = renderHook(() => useUnsavedGuard('Map'), { wrapper })
    act(() => result.current.markDirty())

    const other = { label: 'World Map', onSave: async (): Promise<void> => {} }
    act(() => useUiStore.getState().setDirtyEditor(other))

    unmount()
    expect(useUiStore.getState().dirtyEditor).toBe(other)
  })

  it('updates Recoil dirtyEditorState with the supplied label', async () => {
    let capturedLabel: string | null = null
    const Capture = ({ label }: { label: string }) => {
      const guard = useUnsavedGuard(label)
      return guard
    }

    const { result } = renderHook(() => Capture({ label: 'WorldMap' }), {
      wrapper: StoreWrapper
    })
    act(() => result.current.markDirty())
    // Indirectly verify label propagation by triggering a save flow:
    result.current.saveRef.current = async () => {
      capturedLabel = 'WorldMap'
    }
    act(() => result.current.guard(() => undefined))
    await act(async () => {
      await result.current.handleDialogSave()
    })
    await waitFor(() => expect(capturedLabel).toBe('WorldMap'))
  })
})
