import type { MapDoc } from './types'

export function downloadDoc(doc: MapDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(doc.name || 'process').replace(/[^\w-]+/g, '-').toLowerCase()}.flowmap.json`
  a.click()
  URL.revokeObjectURL(url)
}
