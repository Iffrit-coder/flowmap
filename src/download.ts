import type { Library, MapDoc } from './types'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadDoc(doc: MapDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${(doc.name || 'process').replace(/[^\w-]+/g, '-').toLowerCase()}.flowmap.json`)
}

export function downloadLibrary(library: Library): void {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' })
  triggerDownload(blob, 'flowmap-library.json')
}
