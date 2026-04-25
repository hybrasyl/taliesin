import React, { type ReactNode } from 'react'
import { RecoilRoot, type MutableSnapshot, type RecoilState } from 'recoil'

// `RecoilState<T>` is invariant in T, so the override list has to use `any`
// to hold heterogeneous atoms. Callers still get type-checked via the
// `recoilOverride()` helper which preserves T at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecoilOverride = { atom: RecoilState<any>; value: any }

export function recoilOverride<T>(atom: RecoilState<T>, value: T): RecoilOverride {
  return { atom, value }
}

/**
 * Helper for renderHook / render: returns a wrapper that pre-seeds Recoil
 * atoms.
 *
 *   const { result } = renderHook(() => useThing(), {
 *     wrapper: makeRecoilWrapper([recoilOverride(activeLibraryState, '/lib')]),
 *   })
 */
export function makeRecoilWrapper(overrides: RecoilOverride[] = []) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const initializeState = (snapshot: MutableSnapshot) => {
      for (const o of overrides) snapshot.set(o.atom, o.value)
    }
    return <RecoilRoot initializeState={initializeState}>{children}</RecoilRoot>
  }
}
