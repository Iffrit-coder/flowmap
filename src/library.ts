import { nanoid } from 'nanoid'
import { emptyStep } from './types'
import type { Library, MapDoc, StepData } from './types'

const LIBRARY_KEY = 'flowmap.library.v1'
const LEGACY_DOC_KEY = 'flowmap.doc.v1'

/**
 * A worked example rather than an empty canvas — a first-time visitor should be
 * able to see what a filled-in step looks like, and what a loop looks like,
 * without building one first.
 */
function demoDoc(): MapDoc {
  const steps: StepData[] = [
    { ...emptyStep(), title: 'Brief', owner: 'Client', duration: 30, status: 'done' },
    {
      ...emptyStep(),
      title: 'Draft',
      owner: 'Writer',
      duration: 120,
      status: 'done',
      notes: 'First pass. Rough is fine — the review loop is where it tightens up.',
    },
    { ...emptyStep(), title: 'Review', owner: 'Editor', duration: 45, status: 'in-progress' },
    { ...emptyStep(), title: 'Publish', owner: 'Writer', duration: 15 },
  ]
  const ids = steps.map(() => nanoid(8))

  return {
    version: 1,
    id: nanoid(8),
    name: 'Example: Article pipeline',
    nodes: steps.map((data, i) => ({
      id: ids[i],
      type: 'step' as const,
      position: { x: 80 + i * 260, y: 200 },
      data,
    })),
    edges: [
      { id: nanoid(8), source: ids[0], target: ids[1], data: {} },
      { id: nanoid(8), source: ids[1], target: ids[2], data: {} },
      { id: nanoid(8), source: ids[2], target: ids[3], data: {} },
      {
        id: nanoid(8),
        source: ids[2],
        target: ids[1],
        sourceHandle: 'loop',
        targetHandle: 'back',
        data: { label: 'if changes requested' },
      },
    ],
    updatedAt: new Date().toISOString(),
  }
}

export function blankMap(): MapDoc {
  return {
    version: 1,
    id: nanoid(8),
    name: 'Untitled process',
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Reads the dashboard's collection. On the very first load after this feature
 * shipped there is no library yet, only the old single-map save (or, on a
 * fresh install, nothing at all) — either way this brings exactly one map
 * forward so nothing that existed before is lost.
 */
export function loadLibrary(): Library {
  const raw = localStorage.getItem(LIBRARY_KEY)
  if (raw) {
    try {
      const library = JSON.parse(raw) as Library
      if (library.version === 1 && Array.isArray(library.maps)) return library
    } catch {
      // corrupted — fall through and rebuild from whatever we can recover
    }
  }

  let maps: MapDoc[]
  const legacyRaw = localStorage.getItem(LEGACY_DOC_KEY)
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as Partial<MapDoc>
      maps = [
        {
          version: 1,
          id: nanoid(8),
          name: legacy.name ?? 'Untitled process',
          nodes: legacy.nodes ?? [],
          edges: legacy.edges ?? [],
          updatedAt: legacy.updatedAt ?? new Date().toISOString(),
        },
      ]
    } catch {
      maps = [demoDoc()]
    }
  } else {
    maps = [demoDoc()]
  }

  const library: Library = { version: 1, maps, pinned: [] }
  saveLibrary(library)
  return library
}

export function saveLibrary(library: Library): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
}
