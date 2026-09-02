import { create } from 'zustand'
import * as api from './api'
import type { MapDoc, MapRecord } from './types'

const IMPORT_CHUNK = 25

type LibraryState = {
  maps: MapRecord[]
  loaded: boolean
  refresh: () => Promise<void>
  createMap: () => Promise<string>
  deleteMap: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  renameMap: (id: string, name: string) => Promise<void>
  duplicateMap: (id: string) => Promise<string>
  importMap: (doc: Partial<MapDoc>) => Promise<string>
  importLibrary: (docs: Partial<MapDoc>[]) => Promise<MapRecord[]>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  maps: [],
  loaded: false,

  refresh: async () => {
    const { maps } = await api.listMaps()
    set({ maps, loaded: true })
  },

  createMap: async () => {
    const doc = await api.createMap()
    set((s) => ({ maps: [...s.maps, doc] }))
    return doc.id
  },

  deleteMap: async (id) => {
    await api.deleteMap(id)
    set((s) => ({ maps: s.maps.filter((m) => m.id !== id) }))
  },

  togglePin: async (id) => {
    const current = get().maps.find((m) => m.id === id)
    if (!current) return
    const updated = await api.updateMap(id, { pinned: !current.pinned })
    set((s) => ({ maps: s.maps.map((m) => (m.id === id ? updated : m)) }))
  },

  renameMap: async (id, name) => {
    const updated = await api.updateMap(id, { name })
    set((s) => ({ maps: s.maps.map((m) => (m.id === id ? updated : m)) }))
  },

  duplicateMap: async (id) => {
    const original = get().maps.find((m) => m.id === id)
    if (!original) return id
    const copy = await api.createMap({
      name: `${original.name} (copy)`,
      nodes: original.nodes,
      edges: original.edges,
    })
    set((s) => ({ maps: [...s.maps, copy] }))
    return copy.id
  },

  importMap: async (doc) => {
    const { maps } = await api.importMaps([doc])
    set((s) => ({ maps: [...s.maps, ...maps] }))
    return maps[0].id
  },

  /** Sent in chunks: one request per hundreds of maps would risk the platform's
   * request body limit, and chunking also lets the dashboard show progress on a
   * large import instead of hanging on a single opaque call. */
  importLibrary: async (docs) => {
    const imported: MapRecord[] = []
    for (let i = 0; i < docs.length; i += IMPORT_CHUNK) {
      const { maps } = await api.importMaps(docs.slice(i, i + IMPORT_CHUNK))
      imported.push(...maps)
      set((s) => ({ maps: [...s.maps, ...maps] }))
    }
    return imported
  },
}))
