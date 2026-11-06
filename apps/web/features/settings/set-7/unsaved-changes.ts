export function createUnsavedChangesGuard(isDirty: () => boolean, confirm: () => boolean) {
  return {
    beforeUnload(event: { preventDefault: () => void; returnValue: unknown }) {
      if (!isDirty()) return
      event.preventDefault()
      event.returnValue = ''
    },
    navigate(action: () => void) {
      if (isDirty() && !confirm()) return false
      action()
      return true
    }
  }
}
