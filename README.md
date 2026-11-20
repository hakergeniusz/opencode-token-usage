# opencode-token-usage

Global token and cost accounting for [OpenCode V2](https://opencode.ai), rewritten from the
[`pi-token-usage`](https://github.com/hakergeniusz/pi-token-usage) pi coding-agent extension.
The implementation is original and inspired by Claude Code's cost tracker (`/cost`).

## What it does

- Records every LLM call: primary agent steps, plus OpenCode's auxiliary title / compaction /
  generate usages.
- Keeps cumulative totals across **all sessions** — grand total, per model, per day, and per
  session — persisted durably via the plugin storage API.
- Deduplicates calls by id so redelivered events never double-count.
- Formats totals Claude-Code style: compact `1.2k` / `3.45M` numbers and `$0.0234`-style costs.
- Exposes a `token_usage` agent tool for querying session/global/model/day usage (with top model and daily breakdowns).
- Adds a compact live token/cost readout (including top model) to the TUI prompt footer. No separate `/tokens` command — use OpenCode's built-in `/stats` for native session stats and this plugin's tool/footer for persistent cross-session accounting.

## Install / load

```jsonc title="opencode.jsonc"
{
  "plugins": [
    "opencode-token-usage"
  ]
}
```

The server part (`.` export) and TUI part (`./tui` export) load together. For a TUI-only setup
against a remote server, add the package to `cli.json` instead.

### Options

No options are required. The storage key can be overridden through the plugin options object:

```jsonc title="opencode.jsonc"
{
  "plugins": [
    {
      "package": "opencode-token-usage",
      "options": { "storeKey": "token-usage/custom-store" }
    }
  ]
}
```

## Usage

### `/tokens`

| Argument | Result |
|---|---|
| _(none)_ or `session` | Current session totals + global summary |
| `global` | Grand total, today, top 5 models, last 7 days |
| `models` | Top 20 models by total tokens |
| `days [n]` | Last `n` days (default 14, clamped 1–90) |
| `rebuild` | Recompute every aggregate from the stored call log |
| `reset` | Explain how to reset (no destructive action) |
| `reset confirm` | Clear global history, re-baselining the current session |

Reports are delivered as synthetic messages in the session, which the TUI renders inline.

### `token_usage` tool

| Input | Result |
|---|---|
| `scope: "session"` | Current session totals |
| `scope: "global"` | Grand total + session count |
| `scope: "models"` | Top 10 models |
| `scope: "days"` (with optional `days`, 1–90) | Usage by day |

## How the pi original maps to OpenCode V2

| pi original | OpenCode V2 implementation |
|---|---|
| `~/.pi/agent/token-usage.json` + atomic file writes | `ctx.storage` durable JSON under one key; all access serialized through a queue |
| `pi.on("message_end")` per assistant / toolResult message | `ctx.event.subscribe` on `session.step.ended` (one record per primary model step) |
| Nested tool / compaction usage | `session.usage.recorded` events (`source`: title / compaction / generate) |
| `session_start` backfill, dedup by session id | Deduplication by recorded call id; durable accumulation survives restarts without re-scanning |
| `/tokens rebuild` via `SessionManager.listAll()` | `rebuild()` re-aggregates the plugin's own call log |
| `/tokens` report cards (`registerEntryRenderer`) | Synthetic session messages; plus a `prompt.footer.status` TUI slot |
| `pi.registerCommand` | `ctx.command.transform` |
| `pi.registerTool` (deferred) | `ctx.tool.transform` with `options.codemode` |
| `ctx.ui.confirm` for reset | Two-step `reset` / `reset confirm` |
| `ctx.ui.notify`, print-mode fallback | Synthetic messages; TUI toasts not required for the command path |

## Known gaps / differences

1. **Storage location** — data now lives in OpenCode plugin storage, not `~/.pi/agent/token-usage.json`.
   It is not readable by the original pi extension.
2. **Backfill** — the pi extension re-scanned resumed session files once per session id. OpenCode's
   V2 server SDK has no session-file scan API for plugins, so live deduplicated events plus durable
   storage are used instead. `rebuild` recomputes from the recorded call log rather than from
   OpenCode's own session files.
3. **Tool-result nested usage** — OpenCode does not expose nested LLM usage inside ordinary tool
   results as a separate usage event. Only usages OpenCode emits as `session.usage.recorded` are
   captured; per-tool attribution is not possible.
4. **Context-window percentage** — the original session report's context usage line is omitted;
   the server hook API does not expose a reliable context-window size, and OpenCode's stats endpoint
   is not part of the plugin context.
5. **Interactive reset confirmation** — replaced by the explicit two-step `reset confirm` form.
6. **Print/JSON mode** — the original special-cased non-TUI output; plugins have no print/json mode
   hook, so reports always go through synthetic session messages.
7. **Reasoning tokens** are folded into `output`, and `total` is `input + output` (cache excluded),
   matching the original's fallback formula.
8. **Argument completions** for `/tokens` subcommands are provided in the command description
   rather than through a pi-style completion callback.
9. The original tool's `deferred` exposure has no exact V2 equivalent; the tool is registered as a
   normal codemode-capable tool.

## Development

```bash
bun install
bunx tsc --noEmit -p tsconfig.json   # optional; SDK types come from @opencode/plugin
```

No tests are included: the original extension had no test suite, and porting one would require
pi-runtime test dependencies that this package deliberately avoids.

MIT licensed. Copyright 2026 hakergeniusz.
