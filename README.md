# flowmap

Map how a process actually works — the steps, who does them, how long they take,
and the loops where it doubles back on itself.

Most diagramming tools give you boxes and arrows and stop there. flowmap is built
to be a *living process document*: every step carries a status, an owner, a
duration, and notes, so the map stays useful after the pretty picture is drawn.
It holds any number of maps at once, like a small Drive for process diagrams —
with an account of your own, so your maps follow you across browsers and devices.

![flowmap](docs/screenshot.png)

## Running it

You need a Postgres database (a free [Neon](https://neon.tech) project works) —
put its connection string in `.env.local`:

```
DATABASE_URL=postgresql://...
```

Create the tables once:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Then:

```bash
npm install && npm run dev
```

This runs the Vite dev server and a local API dev server together (`concurrently`),
with `/api` proxied from Vite to the API server. Both talk to the same handler
code that runs on the production deployment.

## Deploying

The `/api` handlers are [Vercel functions](api/), so the whole thing — frontend
and backend — deploys as one Vercel project. It cannot be hosted on a static
host: without a server for `/api`, sign-up and login have nothing to talk to.

```bash
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel --prod
```

### Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string. |
| `RESEND_API_KEY` | no | Enables outbound email. Without it, password reset and verification links are generated but never delivered — the endpoints still behave identically so they give nothing away. |
| `AUTH_EMAIL_FROM` | no | Sender address, e.g. `flowmap <hello@yourdomain>`. Defaults to Resend's shared `onboarding@resend.dev`, which **only delivers to the address that owns the Resend account** — enough to test, not enough to mail anyone else. Sending to other people needs a verified domain. |
| `APP_URL` | no | Origin used to build emailed links. Read from configuration rather than the request's `Host` header, which is attacker-controlled and would otherwise let someone put their own domain into a real reset email. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | no | `true` blocks sign-in until the address is confirmed. Leave it off until email is confirmed working, or every account locks out. |
| `ALERT_EMAIL` | no | Address to notify when a handler throws. Capped at 4 emails/hour. |

## Backups

Neon's free tier keeps **6 hours** of point-in-time history, so anything noticed
the next morning is already gone. `.github/workflows/backup.yml` runs nightly,
dumps the durable tables, encrypts the dump, and keeps it as an artifact for 90
days. It needs two repository secrets: `DATABASE_URL` and `BACKUP_PASSPHRASE`.

The encryption is not optional. This repository is public, and artifacts on a
public repository can be downloaded by anyone who can see the Actions tab, while
the dump contains every user's password hash. The workflow fails rather than
upload a plaintext dump if the passphrase is missing.

To restore:

```bash
gpg --decrypt backup-YYYY-MM-DD.json.gpg > backup.json
DATABASE_URL=... node scripts/restore.mjs backup.json
```

`restore.mjs` refuses to run against a database that already holds users unless
given `--force`, since the expensive mistake is pointing a restore at the live
database rather than at an empty one. Rows are upserted by primary key, so a
`--force` run repairs missing rows instead of duplicating them.

Backups are only real once a restore has been rehearsed. This one was: dumped
from production, restored into a throwaway Neon branch that had been emptied
first, and checked row for row.

## Using it

- **Accounts** — sign up with an email and password. Your maps are stored under
  your account, not just in one browser, so they're there whichever device you
  sign in from.
- **Dashboard** — the landing page. **Search** filters by name — handy once you
  have more than a screenful of maps. **+ New map** opens a blank one; **Import**
  takes any number of files at once — single `.flowmap.json` maps, whole
  `flowmap-library.json` bundles, or a mix — and you can drag them onto the
  dashboard instead, including a folder, which is walked recursively. Files
  that aren't flowmap exports are listed by name and skipped rather than
  failing the batch. **Export all** downloads every map on the dashboard as one
  bundle. Each card can be pinned, renamed
  (double-click the title, or the row action), duplicated, exported, or
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

## Architecture

A Vite + React frontend and a small set of [Vercel functions](api/) under `/api`
sharing one Postgres database (Neon). Auth is plain email/password — passwords
hashed with `scrypt`, sessions as opaque tokens in a `sessions` table and an
`httpOnly` cookie — no third-party auth provider. Every map row belongs to one
user; `pinned` lives on the map itself rather than as a separate list.

Routing between the dashboard and an open map is a `#/map/<id>` hash, not a real
path — no server-side rewrite needed for it. The editor autosaves into the map's
row on a debounce, flushed synchronously (via `fetch(..., { keepalive: true })`)
on navigating away or closing the tab.

**Export** / **Import** move a single map as a `.flowmap.json` file; **Export
all** / **Import** move the whole dashboard as one `flowmap-library.json`
bundle. Either way, import always assigns fresh ids (carrying pinned status
along for a bundle), so re-importing a file — or importing someone else's
export — never collides with what's already on your dashboard. The saved shape
is a plain serializable `MapDoc` ([src/types.ts](src/types.ts)).

## Security

Passwords must be at least 10 characters and are checked against
[Have I Been Pwned](https://haveibeenpwned.com/Passwords) by SHA-1 range query —
five hex characters go out, the comparison happens locally, the password itself
never leaves the server. That check fails open, so a length floor and a common
-password list still apply if the service is unreachable.

Sign-in is throttled per email (10 per 15 minutes) and per IP (30 per 15
minutes); sign-up is throttled per IP (5 per hour). Counters live in
`rate_limits` as fixed windows, because functions share no memory between
invocations. A successful sign-in clears that email's counter. Login runs the
password hash even for addresses with no account, so response time doesn't
reveal who is registered.

Everything a client writes to a map goes through
[`sanitizeMapInput`](src/mapSchema.ts), which rebuilds the document field by
field rather than validating in place — unknown properties are dropped instead
of stored, strings and counts are bounded, and edges pointing at steps that
don't exist are rejected. Responses carry a strict CSP, `frame-ancestors 'none'`,
`nosniff`, and a referrer policy; `/api` responses are `no-store`.

Password reset and email verification run on single-use tokens: 32 random bytes,
stored only as a SHA-256 hash, so a database leak yields no usable link. The raw
token travels in the URL *fragment*, which browsers never send to a server,
keeping it out of access logs and `Referer` headers. Resetting a password
deletes every session for that account — whoever prompted the reset may be
holding a stolen one, so it has to end them, not just add a new way in.

Known gap, deliberately: there is **no sharing** — a map belongs to exactly one
account, so there is no way to grant anyone else access short of sharing
credentials. Sign-up also still discloses whether an address is registered; the
per-IP cap is what keeps harvesting expensive.

## Built with

[React Flow](https://reactflow.dev) for the canvas, Zustand for state, Vite +
React + TypeScript on the frontend; [Neon](https://neon.tech) Postgres and
Vercel functions on the backend. MIT licensed.
