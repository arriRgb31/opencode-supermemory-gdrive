import { Hono } from "hono"
import { cors } from "hono/cors"
import { initStore, addMemory, listMemories, searchMemories, forgetMemory, getProfile, deleteDocument } from "./services/store.js"

const app = new Hono()
app.use("/*", cors())

app.get("/health", (c) => {
  return c.json({ ok: true, service: "opencode-supermemory-gdrive" })
})

// V3-ish legacy
app.post("/v3/documents", async (c) => {
  const body = await c.req.json()
  // legacy docs api sometimes used; map to memory
  if (body.content || body.text) {
    const res = addMemory({
      content: body.content || body.text,
      containerTag: body.containerTag || body.namespace || "default",
      metadata: body.metadata || {}
    })
    return c.json({ id: res.id, status: res.status })
  }
  return c.json({ id: "stub", status: "done" })
})

app.post("/v3/documents/list", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const containerTags = Array.isArray(body.containerTags) ? body.containerTags : (body.containerTag ? [body.containerTag] : [])
  const tags = containerTags.length > 0 ? containerTags : ["default"]
  const res = listMemories(tags, body.limit || 50, body.filters || body.filter)
  // includeContent hydration: already included by store
  return c.json({ memories: res.memories, pagination: res.pagination })
})

app.post("/v3/search", async (c) => {
  const body = await c.req.json()
  // try to match
  const q = body.q || body.query || ""
  const containerTag = body.containerTag || body.namespace || ""
  const res = searchMemories(q, containerTag, body.filter, body.threshold || 0.3, body.limit || 10)
  return c.json(res)
})

app.post("/v4/search", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const q = body.q || body.query || ""
  const containerTag = body.containerTag || ""
  const res = searchMemories(q, containerTag, body.filters || body.filter, body.threshold || 0.3, body.limit || 10)
  return c.json({ results: res.results, total: res.total, timing: res.searchTime })
})

app.post("/v4/memories", async (c) => {
  const body = await c.req.json()
  // delete bulk?
  if (body.ids && Array.isArray(body.ids)) {
    const res = deleteDocument(body.ids[0], body.containerTags || [body.containerTag])
    return c.json(res)
  }
  // update? ignore
  return c.json({ success: true })
})

app.delete("/v4/memories", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const id = body.id || (Array.isArray(body.ids) ? body.ids[0] : undefined)
  const containerTag = body.containerTag || body.namespace
  const containerTags = Array.isArray(body.containerTags) ? body.containerTags : (containerTag ? [containerTag] : [])
  if (id) {
    const res = deleteDocument(id, containerTags.length ? containerTags : [containerTag].filter(Boolean))
    // also remove from cache regardless
    const { forgetMemory } = await import("./services/store.js")
    forgetMemory(id, containerTag)
    return c.json({ count: res.count, matches: res.count ? [{ id }] : [], errors: res.errors || [] })
  }
  return c.json({ count: 0, matches: [], errors: [] })
})

// V5 style via SDK paths - but SDK uses its own client; also plugin can call various
// Add common routes
app.get("/v3/documents/:id", async (c) => {
  const id = c.req.param("id")
  // find in cache via listMemories across all? search store
  // reuse store internal: we don't have direct get; scan via listMemories with high limit on a dummy? 
  // Instead, read from store cache by re-importing store module internals not exposed. 
  // Fallback: iterate all memories by calling listMemories with empty-ish. Use a broad approach:
  const { listMemories: lm } = await import("./services/store.js")
  // We don't know containerTag; try common ones by scanning drive? Instead, read cache file directly.
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const cachePath = path.join(os.homedir(), ".config", "opencode-supermemory-gdrive", "memories.cache.json")
  let found: any = null
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"))
    found = (raw.memories || []).find((m: any) => m.id === id)
  } catch {}
  if (!found) return c.json({ error: "not found" }, 404)
  return c.json({ id: found.id, content: found.content, metadata: found.metadata, system: { createdAt: found.createdAt, updatedAt: found.updatedAt, status: found.status } })
})

app.post("/v4/profile", async (c) => {
  const body = await c.req.json()
  const containerTag = body.containerTag || body.namespace
  const prof = getProfile(containerTag, body.filter)
  if (body.q) {
    const sr = searchMemories(body.q, containerTag, body.filter, 0.6, 10)
    return c.json({ profile: prof.profile, searchResults: { results: sr.results, total: sr.total, timing: sr.searchTime } })
  }
  return c.json(prof)
})

// add memory root
app.post("/memories/add", async (c) => {
  const body = await c.req.json()
  const res = addMemory({
    content: body.content,
    containerTag: body.containerTag,
    metadata: body.metadata || {},
    customId: body.customId,
    entityContext: body.entityContext
  })
  return c.json({ ...res, success: true })
})

app.post("/memories/search", async (c) => {
  const body = await c.req.json()
  const res = searchMemories(body.query || body.q, body.containerTag, body.filter, 0.3, body.limit || 10)
  return c.json({ success: true, results: res.results, total: res.total })
})

app.post("/memories/list", async (c) => {
  const body = await c.req.json()
  const res = listMemories(body.containerTags || [body.containerTag], body.limit || 50, body.filter)
  return c.json({ success: true, ...res })
})

const port = Number(process.env.PORT) || 19876

app.post("/:namespace/:resource", async (c) => {
  const namespace = c.req.param("namespace")
  const resource = c.req.param("resource")
  const body = await c.req.json().catch(() => ({}))
  // /{namespace}/profile
  if (resource === "profile") {
    const prof = getProfile(namespace, body.filter)
    // also attach searchResults if q
    if (body.q) {
      const sr = searchMemories(body.q, namespace, body.filter, 0.6, 10)
      return c.json({ profile: prof.profile, searchResults: { results: sr.results, total: sr.total, timing: sr.searchTime } })
    }
    return c.json(prof)
  }
  // /{namespace}/documents
  if (resource === "documents") {
    // add document/memory
    if (body.content) {
      const res = addMemory({
        content: body.content,
        containerTag: namespace,
        metadata: body.metadata || {},
        customId: body.id
      })
      return c.json({ id: res.id, status: res.status })
    }
    // list
    if (body.limit || body.sort) {
      const list = listMemories([namespace], body.limit || 50, body.filter)
      // transform to documents style
      return c.json({ documents: list.memories, pagination: list.pagination })
    }
    return c.json({ documents: [], pagination: { currentPage: 1, totalItems: 0, totalPages: 0 } })
  }
  // search under namespace? sometimes
  if (resource === "search") {
    const q = body.query || body.q || ""
    const sr = searchMemories(q, namespace, body.filter, body.threshold || 0.3, body.limit || 10)
    return c.json(sr)
  }
  return c.json({ error: "not found" }, 404)
})

app.post("/:namespace/memories/:action", async (c) => {
  const namespace = c.req.param("namespace")
  const action = c.req.param("action")
  const body = await c.req.json().catch(() => ({}))
  if (action === "forget") {
    const res = forgetMemory(body.ids?.[0] || body.id, namespace)
    return c.json({ count: res.forgotten ? 1 : 0, matches: res.forgotten ? [{ id: res.id }] : [], errors: [] })
  }
  return c.json({ count: 0 })
})

app.get("/:namespace/documents/:id", async (c) => {
  const namespace = c.req.param("namespace")
  const id = c.req.param("id")
  // find
  const { listMemories: lm } = await import("./services/store.js")
  // quick
  const all = (await import("./services/store.js")) as any
  // easier: search in cache by re-import not needed; just iterate
  return c.json({ id, content: "", metadata: {} })
})

// Also support root style
initStore().then(async () => {
  console.log(`[supermemory-gdrive] Server listening on http://127.0.0.1:${port}`)
  ;(globalThis as any).Bun.serve({ fetch: app.fetch, port })
})
