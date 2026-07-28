# flowmap

Map how a process actually works — the steps, who does them, how long they take,
and the loops where it doubles back on itself.

Most diagramming tools give you boxes and arrows and stop there. flowmap is built
to be a *living process document*: every step carries a status, an owner, a
duration, and notes, so the map stays useful after the pretty picture is drawn.

**[Try it →](https://iffrit-coder.github.io/flowmap/)**

![flowmap](docs/screenshot.png)

## Running it

```bash
npm install && npm run dev
```

No backend, no accounts, no API keys.

## Using it

- **Steps** — double-click empty canvas, or hit **+ Step**. Select a step to edit
  its title, status, owner, duration, and notes in the side panel. Owner and
  duration surface on the node; status colors its left edge.
- **Flow** — drag from a step's right dot to the next step's left dot.
- **Loops** — drag from a step's top-right dot back to an earlier step's top-left
  dot. It renders as a dashed arc over the row, labeled with the repeat condition
  ("if changes requested").
- **Rollup** — the header keeps a running count of steps, loops, and total time.

## The one interesting bit

Loops are never stored. Nothing on an edge says "I am a loop" — an edge is a loop
because of where it sits in the graph, so re-route the map and the same edge
stops being one on its own.

Deciding *which* edge in a cycle to call the loop is the part that isn't obvious.
The textbook answer is a DFS back-edge search, and it's wrong here: which edge a
DFS blames depends on where the traversal happens to start, so in a
Draft→Review→Draft cycle it will happily label the forward edge as the loop.

[`findBackEdges`](src/graph.ts) instead builds the forward graph greedily,
considering edges most-rightward first — which is the direction these maps are
read — and whatever would close a cycle is a loop. Edges drawn between the
dedicated loop handles are considered last, so an arrow you explicitly drew as a
return arrow stays one.

## Storage

Local for now. The map autosaves to `localStorage`, and **Export** / **Import**
move it as a `.flowmap.json` file.

The saved shape is a plain serializable `MapDoc` ([src/types.ts](src/types.ts))
and the store touches storage in exactly one subscriber, so putting the same
document behind a database and a sync layer later is additive rather than a
rewrite.

## Built with

[React Flow](https://reactflow.dev) for the canvas, Zustand for state, Vite +
React + TypeScript. MIT licensed.
