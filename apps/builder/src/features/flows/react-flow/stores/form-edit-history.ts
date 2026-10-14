/**
 * Decides when an edit in the node editor form records an undo snapshot.
 *
 * The form reports every `field.onChange` as a user change, but several fields
 * echo their current value back on mount (a rich-text editor seeding its
 * content, a select re-asserting its value). Those echoes are not edits:
 * recording them would show "Undo (1)" and dirty the draft just because a
 * block was opened. So a change only counts when the form values actually
 * differ from the last values the form held; the first counted change of a
 * burst takes the snapshot, and `release()` (debounced by the caller) closes
 * the burst so the next edit gets its own entry.
 */
export type FormEditHistory = {
  /**
   * Feed every form value change. Returns whether it counted as an edit.
   * `isUserChange` is false for programmatic writes (`setValue`, `reset`,
   * field-array operations), which never snapshot here.
   */
  onChange: (values: unknown, isUserChange: boolean) => boolean
  /** Ends the current edit burst; the next counted edit snapshots again. */
  release: () => void
}

const serialize = (values: unknown) => JSON.stringify(values ?? null)

export const createFormEditHistory = ({
  initialValues,
  takeSnapshot,
}: {
  initialValues: unknown
  takeSnapshot: () => void
}): FormEditHistory => {
  let lastValues = serialize(initialValues)
  let burstOpen = false

  return {
    onChange: (values, isUserChange) => {
      const serialized = serialize(values)
      const changed = serialized !== lastValues
      lastValues = serialized
      if (!(isUserChange && changed)) {
        return false
      }
      if (!burstOpen) {
        takeSnapshot()
        burstOpen = true
      }
      return true
    },
    release: () => {
      burstOpen = false
    },
  }
}
