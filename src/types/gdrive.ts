export type MemoryItem = {
  id: string
  content: string
  containerTag: string
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  status?: string
}

export type Store = {
  memories: MemoryItem[]
  version: number
}

export type SearchResult = {
  id: string
  memory?: string
  content?: string
  chunk?: string
  text?: string
  context?: any
  score?: number
  similarity?: number
  title?: string
  filepath?: string
  updatedAt?: string
  metadata?: Record<string, any> | null
  containerTag?: string
  system?: {
    createdAt?: string
    updatedAt?: string
    status?: string
  }
}
