import { useStore } from '../store'

/** Shown when a save was refused because someone else saved first. Autosave is
 * already stopped by then, so this is a genuine fork: one of the two versions
 * is about to be discarded and only the user can say which.
 *
 * There is deliberately no automatic merge. Silently interleaving two people's
 * edits to a graph produces a document neither of them wrote. */
export default function ConflictBanner() {
  const conflict = useStore((s) => s.conflict)
  const reload = useStore((s) => s.resolveConflictByReloading)
  const overwrite = useStore((s) => s.resolveConflictByOverwriting)
  if (!conflict) return null

  return (
    <div className="conflict-banner" role="alert">
      <div className="conflict-text">
        <strong>Someone else saved this map while you were editing.</strong>
        <span>Your changes since then aren't saved. Pick which version to keep.</span>
      </div>
      <div className="conflict-actions">
        <button type="button" onClick={reload}>
          Use their version
        </button>
        <button type="button" className="primary" onClick={overwrite}>
          Keep mine
        </button>
      </div>
    </div>
  )
}
