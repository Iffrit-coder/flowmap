# flowmap

Map how a process actually works — the steps, who does them, how long they take,
and the loops where it doubles back on itself.

Most diagramming tools give you boxes and arrows and stop there. flowmap is built
to be a *living process document*: every step carries a status, an owner, a
duration, and notes, so the map stays useful after the pretty picture is drawn.
It holds any number of maps at once, like a small Drive for process diagrams.

**[Try it →](https://iffrit-coder.github.io/flowmap/)**

![flowmap](docs/screenshot.png)

## Running it

```bash
npm install && npm run dev
```

No backend, no accounts, no API keys.

## Using it

- **Dashboard** — the landing page. **+ New map** opens a blank one; **Import**
  adds a `.flowmap.json` file to the collection. Each card can be pinned,
  renamed (double-click the title, or the row action), duplicated, exported, or
  deleted, without opening it.
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

Local for now. Every map lives in one `localStorage` library keyed by id, and
the open map autosaves into its own slot (flushed on navigating away or closing
the tab, not just on a debounce timer). **Export** / **Import** move a single
map as a `.flowmap.json` file — importing always assigns a fresh id, so
re-importing a file never collides with the original.

The saved shape is a plain serializable `MapDoc` ([src/types.ts](src/types.ts))
and the storage layer ([src/library.ts](src/library.ts)) is the only thing that
touches `localStorage`, so putting the same documents behind a database and a
sync layer later is additive rather than a rewrite. Routing between the
dashboard and an open map is a plain `#/map/<id>` hash — no server-side rewrite
needed, which matters on GitHub Pages.

## Built with

[React Flow](https://reactflow.dev) for the canvas, Zustand for state, Vite +
React + TypeScript. MIT licensed.
