import { execSync, exec } from "child_process"
import { promisify } from "util"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const CONFIG_DIR = join(homedir(), ".config", "opencode-supermemory-gdrive")
const STATE_PATH = join(CONFIG_DIR, "state.json")
const execAsync = promisify(exec)
const REMOTE = process.env.SUPERMEMORY_GDRIVE_REMOTE || "gdrive"
const FOLDER = process.env.SUPERMEMORY_GDRIVE_FOLDER || "opencode-supermemory"
const REMOTE_PATH = `${REMOTE}:${FOLDER}`
const FILE_NAME = "memories.json"

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

function loadJson<T>(p: string): T | null {
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, "utf8")) } catch { return null }
}

function saveJson(p: string, data: any) {
  ensureDir(p.split("/").slice(0, -1).join("/") || ".")
  writeFileSync(p, JSON.stringify(data, null, 2))
}

export function loadState(): any {
  return loadJson<any>(STATE_PATH) || {}
}

export function saveState(s: any) {
  ensureDir(CONFIG_DIR)
  saveJson(STATE_PATH, s)
}

export function hasAuth(): boolean {
  try {
    const remotes = execSync("rclone listremotes", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return remotes.split("\n").some(r => r.trim().replace(":", "") === REMOTE)
  } catch {
    return false
  }
}

export async function getDrive(): Promise<any> {
  return { remote: REMOTE, folder: FOLDER }
}

export async function ensureDriveFolder(drive: any): Promise<string> {
  try {
    await execAsync(`rclone mkdir "${REMOTE_PATH}"`)
  } catch {}
  return FOLDER
}

export async function readMemoriesJson(drive: any, folderId: string): Promise<any> {
  const tmp = join(CONFIG_DIR, "memories.cache.json")
  ensureDir(CONFIG_DIR)
  try {
    await execAsync(`rclone copyto "${REMOTE_PATH}/${FILE_NAME}" "${tmp}"`)
    if (existsSync(tmp)) {
      const data = JSON.parse(readFileSync(tmp, "utf8"))
      return data
    }
  } catch {
    // file may not exist yet
  }
  return { memories: [], version: 1 }
}

export async function writeMemoriesJson(drive: any, folderId: string, data: any) {
  const tmp = join(CONFIG_DIR, "memories.cache.json")
  ensureDir(CONFIG_DIR)
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  await execAsync(`rclone copyto "${tmp}" "${REMOTE_PATH}/${FILE_NAME}"`)
  saveState({ ...loadState(), lastSync: new Date().toISOString() })
  return `${REMOTE_PATH}/${FILE_NAME}`
}

// auth helpers
export function runRcloneConfig() {
  // interactive; caller should run in terminal
  execSync("rclone config", { stdio: "inherit" })
}
