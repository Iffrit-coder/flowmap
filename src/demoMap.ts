import { nanoid } from 'nanoid'
import { emptyStep } from './types'
import type { MapDoc, StepData } from './types'

/**
 * A worked example rather than an empty canvas — a first-time visitor should be
 * able to see what a filled-in step looks like, and what a loop looks like,
 * without building one first. Seeded as every new account's first map.
 */
export function demoDoc(): MapDoc {
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
    pinned: false,
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
