/* ============================================================
   Editor draft state for the workflow & task editors.

   Local component state only — nothing is persisted across navigation. Leaving
   an editor and coming back loads fresh from saved data (no unsaved-draft cache).
   The hook still seeds the draft on mount, reloads it when the edited entity
   changes within a mounted editor, and swaps in a chosen historical version.
   ============================================================ */
import React from 'react'

const { useState, useEffect, useRef } = React

// Shared draft manager for the workflow & task editors.
//   fresh()            -> a draft built from the entity's saved data
//   loadVersion(v)     -> a draft for the chosen historical version (null = skip)
//   onSwitchEntity()   -> reset side state (tab, open step) when the id changes
//   onSelectVersion()  -> reset side state when the version changes
export function useEditorDraft({ key, curVer, fresh, loadVersion, onSwitchEntity, onSelectVersion }) {
  const [selVer, setSelVer] = useState(curVer)
  const [draft, setDraft] = useState(fresh)
  const prevKey = useRef(key)
  const prevSel = useRef(selVer)
  // Switch to a different entity within the editor (most switches remount, so this
  // is rare). Reload fresh from saved data; guarded so it never fires on mount.
  useEffect(() => {
    if (key === prevKey.current) return
    prevKey.current = key
    setSelVer(curVer); setDraft(fresh()); prevSel.current = curVer
    if (onSwitchEntity) onSwitchEntity()
  }, [key])
  // Load a different version into the draft when picked from the dropdown. Guarded
  // so it never fires on mount.
  useEffect(() => {
    if (selVer === prevSel.current) return
    prevSel.current = selVer
    const next = loadVersion(selVer)
    if (next != null) setDraft(next)
    if (onSelectVersion) onSelectVersion()
  }, [selVer])
  return { draft, setDraft, selVer, setSelVer }
}
