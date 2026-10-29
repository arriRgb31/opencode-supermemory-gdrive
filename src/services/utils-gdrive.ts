import { randomUUID } from "crypto"

export function nowISO() {
  return new Date().toISOString()
}

export function genId() {
  return randomUUID()
}

export function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

export function simpleSearch(query: string, text: string) {
  const q = normalize(query)
  const t = normalize(text)
  if (!q) return 0
  if (t.includes(q)) return 0.8
  const tokens = q.split(" ").filter(Boolean)
  if (tokens.length === 0) return 0
  let hit = 0
  for (const tok of tokens) {
    if (t.includes(tok)) hit++
  }
  return hit / tokens.length * 0.6
}
