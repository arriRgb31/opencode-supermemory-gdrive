import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const CREDENTIALS_DIR = join(homedir(), ".config", "opencode-supermemory-gdrive");
export const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
const RCLONE_CONF = join(homedir(), ".config", "rclone", "rclone.conf");

export interface Credentials { apiKey: string; apiBaseUrl?: string; createdAt: string; }
export interface AuthResult { success: boolean; apiKey?: string; error?: string; }

function hasRemote(): boolean {
  try {
    const out = execSync("rclone listremotes", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").some(r => r.trim().replace(":", "") === "gdrive");
  } catch { return false; }
}

export function loadCredentials(): Credentials | null {
  if (!hasRemote()) return null;
  return { apiKey: "gdrive-local", apiBaseUrl: "http://127.0.0.1:19876", createdAt: new Date().toISOString() };
}

export function saveCredentials(apiKey: string, apiBaseUrl?: string): void { /* no-op; rclone manages */ }

export function clearCredentials(): boolean {
  try { execSync("rclone config delete gdrive", { stdio: "ignore" }); return true; } catch { return false; }
}

function openUrl(url: string) {
  try {
    if (existsSync("/data/data/com.termux/files/usr/bin/termux-open-url")) {
      spawn("termux-open-url", [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
  } catch {}
  try { execSync(`xdg-open '${url}'`, { stdio: "ignore" }); } catch {}
}

export async function startAuthFlow(_timeoutMs?: number): Promise<AuthResult> {
  if (hasRemote()) {
    return { success: true, apiKey: "gdrive-local" };
  }
  return new Promise<AuthResult>((resolve) => {
    const child = spawn("rclone", ["authorize", "drive"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let opened = false;
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
      const m = s.match(/http:\/\/127\.0\.0\.1:53682\/auth\?state=[A-Za-z0-9_-]+/);
      if (m && !opened) { opened = true; openUrl(m[0]); }
    });
    child.stderr.on("data", (d) => process.stderr.write(d.toString()));
    child.on("close", (code) => {
      if (code !== 0) { resolve({ success: false, error: `rclone authorize exit ${code}` }); return; }
      const m = stdout.match(/\{[\s\S]*"access_token"[\s\S]*\}/);
      if (!m) { resolve({ success: false, error: "token not found" }); return; }
      const tokenJson = m[0].trim();
      try { JSON.parse(tokenJson); } catch { resolve({ success: false, error: "invalid token" }); return; }
      // write rclone.conf
      mkdirSync(join(homedir(), ".config", "rclone"), { recursive: true });
      let conf = existsSync(RCLONE_CONF) ? readFileSync(RCLONE_CONF, "utf8") : "";
      conf = conf.replace(/\[gdrive\][\s\S]*?(?=\n\[|$)/, "").trim() + "\n";
      const block = `[gdrive]\ntype = drive\nclient_id = \nclient_secret = \ntoken = ${tokenJson}\nteam_drive = \n\n`;
      writeFileSync(RCLONE_CONF, conf + block);
      try { execSync("rclone mkdir gdrive:opencode-supermemory", { stdio: "ignore" }); } catch {}
      resolve({ success: true, apiKey: "gdrive-local" });
    });
    child.on("error", (e) => resolve({ success: false, error: String(e) }));
  });
}
