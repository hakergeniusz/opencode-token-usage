# opencode-token-usage

Global token and cost accounting for [OpenCode](https://opencode.ai). Tracks usage across sessions, persists totals in plugin storage, and provides a query tool plus a live TUI footer readout.

## What it does

- Records every LLM call: primary agent steps, plus auxiliary title / compaction / generate usages emitted by OpenCode.
- Keeps cumulative totals across **all sessions** — grand total, per model, per day, and per session — persisted durably in plugin storage.
- Deduplicates calls by id so redelivered events never double-count.
- Formats totals in a compact style: `1.2k` / `3.45M` token counts and `$0.0234`-style costs.
- Exposes a `token_usage` agent tool for querying session, global, model, and daily usage (including top models and daily breakdowns).
- Adds a compact live token/cost readout to the TUI prompt footer. No separate `/tokens` command is registered — use OpenCode's built-in `/stats` for native session statistics and this plugin for persistent cross-session accounting.

## Install / load

```jsonc title="opencode.jsonc"
{
  "plugins": [
    "opencode-token-usage"
  ]
}
```

The server part (`.` export) and TUI part (`./tui` export) load together. For a TUI-only setup against a remote server, add the package to `cli.json` instead.

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

### `token_usage` tool (agent-visible)

| Input | Result |
|---|---|
| `scope: "session"` | Current session totals |
| `scope: "global"` | Grand total + session count (and top model summary) |
| `scope: "models"` | Top 10 models |
| `scope: "days"` (with optional `days`, 1–90) | Usage by day |

## Storage and behavior notes

- **Storage location** — data lives in OpenCode plugin storage (durable JSON under a key), not in an external file.
- **Aggregation** — live deduplicated events are accumulated durably; `rebuild()` can recompute aggregates from the recorded call log.
- **Coverage** — only usages OpenCode emits as usage events are captured. Nested LLM usage inside ordinary tool results is not exposed as a separate usage event, so per-tool attribution is not available.
- **Context window** — the plugin does not compute a context-window percentage; OpenCode's own stats/usage surfaces provide that.
- **Accounting** — reasoning tokens are folded into `output`, and `total` is `input + output` (cache tokens tracked separately).

## Development

```bash
bun install
```

MIT licensed. Copyright 2026 hakergeniusz.
