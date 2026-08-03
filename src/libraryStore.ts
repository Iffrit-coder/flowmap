import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { blankMap, loadLibrary, saveLibrary } from './library'
import type { MapDoc } from './types'

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
}))
