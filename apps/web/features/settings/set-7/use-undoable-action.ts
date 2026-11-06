'use client'

import { useState, useSyncExternalStore } from 'react'
import { createUndoableAction, type DeferredCommit } from './undoable-action'

/** The callback must forward keepalive to fetch. Own the hook above any optimistic row removal. */
export function useUndoableAction(commit: DeferredCommit) {
  const [action] = useState(() => createUndoableAction(commit, typeof window === 'undefined' ? undefined : window))
  const snapshot = useSyncExternalStore(action.subscribe, action.getSnapshot, action.getSnapshot)

  // Freeze the selected object's callback when queued, even if the owner later re-renders.
  return { ...snapshot, start: () => action.start(commit), undo: action.undo }
}
