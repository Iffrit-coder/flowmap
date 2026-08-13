import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { blankMap, loadLibrary, saveLibrary } from './library'
import type { Library, MapDoc } from './types'

type LibraryState = {
  maps: MapDoc[]
  pinned: string[]
  refresh: () => void
  createMap: () => string
  deleteMap: (id: string) => void
  togglePin: (id: string) => void
  renameMap: (id: string, name: string) => void
  duplicateMap: (id: string) => string
  importMap: (doc: MapDoc) => string
  importLibrary: (bundle: Library) => void
}

export const useLibraryStore = create<LibraryState>((set) => ({
  maps: [],
  pinned: [],

  refresh: () => {
    const library = loadLibrary()
    set({ maps: library.maps, pinned: library.pinned })
  },

  createMap: () => {
    const doc = blankMap()
    const library = loadLibrary()
    library.maps = [...library.maps, doc]
    saveLibrary(library)
    set({ maps: library.maps, pinned: library.pinned })
    return doc.id
  },

  deleteMap: (id) => {
    const library = loadLibrary()
    library.maps = library.maps.filter((m) => m.id !== id)
    library.pinned = library.pinned.filter((p) => p !== id)
    saveLibrary(library)
    set({ maps: library.maps, pinned: library.pinned })
  },

  togglePin: (id) => {
    const library = loadLibrary()
    library.pinned = library.pinned.includes(id)
      ? library.pinned.filter((p) => p !== id)
      : [...library.pinned, id]
    saveLibrary(library)
    set({ pinned: library.pinned })
  },

  renameMap: (id, name) => {
    const library = loadLibrary()
    library.maps = library.maps.map((m) =>
      m.id === id ? { ...m, name, updatedAt: new Date().toISOString() } : m,
    )
    saveLibrary(library)
    set({ maps: library.maps })
  },

  duplicateMap: (id) => {
    const library = loadLibrary()
    const original = library.maps.find((m) => m.id === id)
    if (!original) return id
    const copy: MapDoc = {
      ...original,
      id: nanoid(8),
      name: `${original.name} (copy)`,
      updatedAt: new Date().toISOString(),
    }
    library.maps = [...library.maps, copy]
    saveLibrary(library)
    set({ maps: library.maps })
    return copy.id
  },

  importMap: (doc) => {
    const library = loadLibrary()
    const imported: MapDoc = { ...doc, id: nanoid(8), updatedAt: new Date().toISOString() }
    library.maps = [...library.maps, imported]
    saveLibrary(library)
    set({ maps: library.maps, pinned: library.pinned })
    return imported.id
  },

  importLibrary: (bundle) => {
    const library = loadLibrary()
    const idMap = new Map<string, string>()
    const imported = bundle.maps.map((doc): MapDoc => {
      const id = nanoid(8)
      idMap.set(doc.id, id)
      return { ...doc, id, updatedAt: new Date().toISOString() }
    })
    const newlyPinned = bundle.pinned
      .map((id) => idMap.get(id))
      .filter((id): id is string => id !== undefined)
    library.maps = [...library.maps, ...imported]
    library.pinned = [...library.pinned, ...newlyPinned]
    saveLibrary(library)
    set({ maps: library.maps, pinned: library.pinned })
  },
}))
