import { genId, nowISO, simpleSearch } from "./utils-gdrive.js"
import { getDrive, ensureDriveFolder, readMemoriesJson, writeMemoriesJson, hasAuth } from "./gdrive.js"
import type { MemoryItem, Store, SearchResult } from "../types/gdrive.js"

let cache: Store = { memories: [], version: 1 }
let folderId: string | null = null
let drive: any = null
let dirty = false
let saveTimer: any = null

export async function initStore() {
  if (!hasAuth()) {
    console.error("[supermemory-gdrive] No auth found. Run: bun run auth")
    // still allow? but will fail
  }
  try {
    drive = await getDrive()
    folderId = await ensureDriveFolder(drive)
    const data = await readMemoriesJson(drive, folderId)
    cache = {
      memories: Array.isArray(data.memories) ? data.memories : [],
      version: data.version || 1
    }
    console.log(`[supermemory-gdrive] Loaded ${cache.memories.length} memories from Google Drive (folder: ${folderId})`)
  } catch (e: any) {
    console.error("[supermemory-gdrive] Failed to init from Drive:", e?.message || e)
    cache = { memories: [], version: 1 }
  }
}

function scheduleSave() {
  if (!drive || !folderId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await writeMemoriesJson(drive, folderId!, cache)
      dirty = false
      console.log("[supermemory-gdrive] Synced to Google Drive")
    } catch (e: any) {
      console.error("[supermemory-gdrive] Sync failed:", e?.message || e)
    }
  }, 500)
}

export function addMemory(input: {
  content: string
  containerTag: string
  metadata?: Record<string, any>
  customId?: string
  entityContext?: string
}) {
  const now = nowISO()
  const item: MemoryItem = {
    id: input.customId || genId(),
    content: input.content,
    containerTag: input.containerTag,
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
    status: "done"
  }
  cache.memories.push(item)
  scheduleSave()
  return { id: item.id, status: "done" }
}

export function listMemories(containerTags: string[], limit: number, filter?: any) {
  let items = cache.memories.slice()
  if (Array.isArray(containerTags) && containerTags.length > 0) {
    const set = new Set(containerTags)
    items = items.filter(m => set.has(m.containerTag))
  }
  // basic filter by metadata AND
  if (filter?.AND && Array.isArray(filter.AND)) {
    items = items.filter(m => {
      for (const f of filter.AND) {
        if (f.filterType === "metadata") {
          if (m.metadata?.[f.key] !== f.value) return false
        }
      }
      return true
    })
  }
  items.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  items = items.slice(0, limit)
  const memories: any[] = items.map(m => ({
    ...m,
    summary: m.content.slice(0, 120),
    containerTags: [m.containerTag],
    system: { createdAt: m.createdAt, updatedAt: m.updatedAt, status: m.status }
  }))
  return {
    memories,
    pagination: {
      currentPage: 1,
      totalItems: memories.length,
      totalPages: 1
    }
  }
}

export function searchMemories(query: string, containerTag: string, filter?: any, threshold = 0.3, limit = 10) {
  let items = cache.memories.slice()
  if (containerTag) {
    items = items.filter(m => m.containerTag === containerTag)
  }
  if (filter?.AND && Array.isArray(filter.AND)) {
    items = items.filter(m => {
      for (const f of filter.AND) {
        if (f.filterType === "metadata") {
          if (m.metadata?.[f.key] !== f.value) return false
        }
      }
      return true
    })
  }
  const results: SearchResult[] = []
  for (const m of items) {
    const score = simpleSearch(query, m.content)
    if (score >= threshold) {
      results.push({
        id: m.id,
        memory: m.content,
        content: m.content,
        chunk: m.content,
        text: m.content,
        score,
        similarity: score,
        updatedAt: m.updatedAt,
        metadata: m.metadata,
        containerTag: m.containerTag,
        system: { createdAt: m.createdAt, updatedAt: m.updatedAt, status: m.status }
      })
    }
  }
  results.sort((a,b) => (b.score||0) - (a.score||0))
  return {
    results: results.slice(0, limit),
    total: results.length,
    searchTime: 1
  }
}

export function forgetMemory(id: string, containerTag?: string) {
  const before = cache.memories.length
  cache.memories = cache.memories.filter(m => !(m.id === id && (containerTag ? m.containerTag === containerTag : true)))
  if (cache.memories.length !== before) {
    scheduleSave()
    return { id, forgotten: true }
  }
  return { id, forgotten: false }
}

export function getProfile(containerTag: string, filter?: any) {
  let items = cache.memories.slice()
  if (containerTag) {
    items = items.filter(m => m.containerTag === containerTag)
  }
  if (filter?.AND && Array.isArray(filter.AND)) {
    items = items.filter(m => {
      for (const f of filter.AND) {
        if (f.filterType === "metadata") {
          if (m.metadata?.[f.key] !== f.value) return false
        }
      }
      return true
    })
  }
  items.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const facts = items.slice(0, 10).map(m => ({
    memory: m.content.split("\n")[0].slice(0, 200)
  }))
  // split into static/dynamic roughly
  return {
    profile: {
      static: facts.slice(0, 5),
      dynamic: facts.slice(5, 10)
    }
  }
}

export function deleteDocument(id: string, namespaces: string[]) {
  const before = cache.memories.length
  if (!Array.isArray(namespaces) || namespaces.length === 0) {
    cache.memories = cache.memories.filter(m => m.id !== id)
  } else {
    cache.memories = cache.memories.filter(m => !(m.id === id && namespaces.includes(m.containerTag)))
  }
  if (cache.memories.length !== before) {
    scheduleSave()
    return { count: 1, errors: [] }
  }
  return { count: 0, errors: [] }
}
