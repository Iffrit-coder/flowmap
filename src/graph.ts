import type { FlowEdge, StepNode } from './types'

/** An edge the user explicitly drew top-to-top is a loop by intent. */
const drawnAsLoop = (edge: FlowEdge) =>
  edge.sourceHandle === 'loop' && edge.targetHandle === 'back'

/**
 * Loops are emergent — nothing on an edge says "I am a loop", it just closes a
 * cycle. Which edge in a cycle gets called the loop can't come from a plain DFS,
 * because that answer depends on where the traversal happened to start.
 *
 * So we build the forward graph greedily instead: consider edges most-forward
 * first (by how far right they travel, which is how these maps are read), and
 * the ones that would close a cycle are the loops. Edges the user deliberately
 * drew between the loop handles go last, so they lose ties and stay loops.
 */
export function findBackEdges(nodes: StepNode[], edges: FlowEdge[]): Set<string> {
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))
  const travel = (e: FlowEdge) => (x.get(e.target) ?? 0) - (x.get(e.source) ?? 0)

  const ordered = [...edges].sort((a, b) => {
    const intent = Number(drawnAsLoop(a)) - Number(drawnAsLoop(b))
    return intent !== 0 ? intent : travel(b) - travel(a)
  })

  const forward = new Map<string, string[]>()
  const reaches = (from: string, goal: string) => {
    const seen = new Set<string>()
    const stack = [from]
    while (stack.length) {
      const id = stack.pop()!
      if (id === goal) return true
      if (seen.has(id)) continue
      seen.add(id)
      stack.push(...(forward.get(id) ?? []))
    }
    return false
  }

  const backEdges = new Set<string>()
  for (const edge of ordered) {
    if (edge.source === edge.target || reaches(edge.target, edge.source)) {
      backEdges.add(edge.id)
      continue
    }
    const list = forward.get(edge.source)
    if (list) list.push(edge.target)
    else forward.set(edge.source, [edge.target])
  }

  return backEdges
}

/** Total of every step's duration, in minutes. Loops are not multiplied out. */
export function totalDuration(nodes: StepNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.data.duration || 0), 0)
}

export function formatDuration(minutes: number): string {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}
