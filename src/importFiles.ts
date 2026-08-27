import type { Library, MapDoc } from './types'

export type ImportFailure = { name: string; reason: string }
export type ImportRead = { maps: Partial<MapDoc>[]; failures: ImportFailure[] }

/** A flowmap export is either a single map or a whole-dashboard bundle, and
 * both arrive through the same picker. Shape decides which one it is — not the
 * file name, since an export can be renamed to anything. */
export function parseImportText(text: string): Partial<MapDoc>[] {
  const parsed = JSON.parse(text) as Partial<Library> & Partial<MapDoc>
  if (parsed.version !== 1) throw new Error('not a flowmap export')
  if (Array.isArray(parsed.maps)) return parsed.maps
  if (Array.isArray(parsed.nodes)) return [parsed as MapDoc]
  throw new Error('not a flowmap export')
}

function reasonFor(err: unknown): string {
  return err instanceof SyntaxError ? "isn't valid JSON" : "isn't a flowmap export"
}

/** Reads every file, keeping the good ones rather than failing the batch on the
 * first bad one — dropping a folder that happens to hold a stray file should
 * still import the rest. */
type FileResult =
  | { ok: true; maps: Partial<MapDoc>[] }
  | { ok: false; failure: ImportFailure }

export async function readImportFiles(files: File[]): Promise<ImportRead> {
  const results = await Promise.all(
    files.map(async (file): Promise<FileResult> => {
      try {
        return { ok: true, maps: parseImportText(await file.text()) }
      } catch (err) {
        return { ok: false, failure: { name: file.name, reason: reasonFor(err) } }
      }
    }),
  )

  const maps: Partial<MapDoc>[] = []
  const failures: ImportFailure[] = []
  for (const result of results) {
    if (result.ok) maps.push(...result.maps)
    else failures.push(result.failure)
  }
  return { maps, failures }
}

/** `readEntries` yields at most 100 entries per call and signals the end with an
 * empty batch, so it has to be drained in a loop rather than called once. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        next()
      }, reject)
    next()
  })
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/** Walks a dropped directory so dragging a folder of exports works, which is the
 * natural gesture for importing a backup. Non-JSON files are skipped silently
 * here — a folder is expected to hold unrelated things, whereas a file picked by
 * hand is not, and that one is reported as a failure instead. */
async function collectFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry)
    return file.name.toLowerCase().endsWith('.json') ? [file] : []
  }
  if (!entry.isDirectory) return []
  const entries = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
  const nested = await Promise.all(entries.map(collectFromEntry))
  return nested.flat()
}

/** Pulls files out of a drop, descending into any folders. Falls back to the
 * flat `files` list on browsers that don't expose directory entries. */
export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) return Array.from(transfer.files)
  const collected = await Promise.all(entries.map(collectFromEntry))
  return collected.flat()
}
