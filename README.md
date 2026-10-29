# opencode-supermemory-gdrive

OpenCode plugin with persistent memory, backed by **your own Google Drive** (via rclone). No external memory service required.

One package, one install: `install` → `auth` (Google login) → use OpenCode.

## Requirements

- OpenCode native Termux (Hope2333 port, v1.19.x).
- [rclone](https://rclone.org) with a `gdrive` remote (created automatically on first `auth`)
- Bun or Node.js

## Installation

```bash
bunx opencode-supermemory-gdrive@latest install
bunx opencode-supermemory-gdrive@latest auth      # opens browser, login Google, auto-return
bunx opencode-supermemory-gdrive@latest status    # check connection
```

Or let your agent do it: paste into OpenCode:

```
Install opencode-supermemory-gdrive by following this README.
```

## How it works

- Plugin (OpenCode V1/V2) registers the `supermemory` tool, recall, capture, and compaction hooks.
- Stores memories in your own Google Drive: `gdrive:opencode-supermemory/memories.json` (via rclone).
- Auth uses rclone's Google Drive OAuth (`rclone authorize drive`), auto-opens the browser, saves the token to rclone config.

## Memory scoping

Same as stock supermemory: project/user scopes, container tags derived from the repo.

## Configuration

Optional (advanced):
- `SUPERMEMORY_GDRIVE_REMOTE` (default `gdrive`)
- `SUPERMEMORY_GDRIVE_FOLDER` (default `opencode-supermemory`)

## Credits

Forked from [supermemoryai/opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory). Storage backend replaced with Google Drive via rclone.

## License

MIT
