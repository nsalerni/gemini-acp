# gemini-acp

[![npm version](https://img.shields.io/npm/v/@nsalerni/gemini-acp)](https://www.npmjs.com/package/@nsalerni/gemini-acp)
[![CI](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml/badge.svg)](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Talk to the [Gemini CLI](https://ai.google.dev/gemini-cli) from Node.js over the **ACP (Agent Control Protocol)**. Stream agent responses, handle tool approvals, manage sessions, and connect MCP servers — all fully typed, zero dependencies.

## Install

```bash
npm install @nsalerni/gemini-acp
```

Requires Node.js 18+ and [Gemini CLI](https://ai.google.dev/gemini-cli) v0.30+.

## Quick Start

```typescript
import { createGeminiClient } from "@nsalerni/gemini-acp";

const client = await createGeminiClient();
const session = await client.openSession({ model: "gemini-3.1-flash" });

for await (const update of session.send("List the files in this directory")) {
  if (update.sessionUpdate === "agent_message_chunk") {
    process.stdout.write(update.content?.text ?? "");
  }
}

await session.close();
await client.close();
```

Or get the result directly without streaming:

```typescript
import { collectTurn } from "@nsalerni/gemini-acp/helpers";

const result = await collectTurn(session.send("Explain this codebase"));
console.log(result.text);
console.log(`${result.toolCalls.length} tools used`);
```

## Preflight Check

Verify the Gemini CLI is installed before creating a client:

```typescript
import { preflightGemini } from "@nsalerni/gemini-acp";

const check = await preflightGemini();
if (!check.ok) {
  console.error("Issues:", check.diagnostics);
  // e.g. "Gemini CLI not found. Install from https://ai.google.dev/gemini-cli"
}
// check.version, check.binaryFound, check.acpSupported
```

## Sending Prompts

`session.send()` sends a prompt and returns a stream of updates in one call:

```typescript
// Plain text
for await (const update of session.send("Explain this codebase")) { ... }

// With images
import { imageFileToContentBlock } from "@nsalerni/gemini-acp/helpers";

const image = await imageFileToContentBlock("screenshot.png");
for await (const update of session.send([
  { type: "text", text: "What's in this image?" },
  image,
])) { ... }
```

For low-level control, use `prompt()` + `updates()` separately:

```typescript
const result = await session.prompt("Explain this codebase");
console.log(result.stopReason); // "end_turn", "max_tokens", "cancelled", etc.
for await (const update of session.updates()) { ... }
```

## Handling Updates

```typescript
for await (const update of session.send("Refactor the auth module")) {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      process.stdout.write(update.content?.text ?? "");
      break;
    case "tool_call":
      console.log(`Tool: ${update.title}`);
      break;
    case "plan":
      console.log(update.entries.map(e => e.content).join("\n"));
      break;
  }
}
```

## MCP Servers

Connect MCP tool servers to your sessions:

```typescript
const client = await createGeminiClient({
  mcpServers: [
    { name: "filesystem", command: "npx", args: ["-y", "@anthropic/mcp-filesystem"] },
    { name: "github", command: "npx", args: ["-y", "@anthropic/mcp-github"] },
  ],
});

// Or per-session:
const session = await client.openSession({
  mcpServers: [{ name: "custom", command: "./my-tool-server" }],
});
```

## Modes & Permissions

| Mode | Behavior |
|------|----------|
| `"yolo"` | Agent executes tools immediately (default) |
| `"plan"` | Agent proposes a plan; tools require approval |

```typescript
const session = await client.openSession({
  mode: "plan",
  onPermissionRequest: async (request) => {
    const allow = request.options.find(o => o.kind === "allow_once");
    if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
    return { outcome: { outcome: "cancelled" } };
  },
});
```

Set a default handler at the client level (overridable per-session):

```typescript
const client = await createGeminiClient({ onPermissionRequest: handler });
```

## Sandboxed Sessions

Run Gemini in isolation without affecting your main config:

```typescript
import { createIsolatedGeminiHome } from "@nsalerni/gemini-acp/helpers";

const { env } = await createIsolatedGeminiHome({ stateDir: "/tmp/my-app" });
const client = await createGeminiClient({ env });
```

## Session Resumption

```typescript
const session = await client.openSession({ model: "gemini-3.1-flash" });
const savedId = session.id;
await session.close();

const resumed = await client.openSession({ resumeSessionId: savedId });
```

## Warm Start

Pre-initialize a background session so `openSession()` is near-instant:

```typescript
const client = await createGeminiClient({ warmStart: true });
const session = await client.openSession(); // fast
```

## Observability

Track lifecycle events for logging, metrics, or debugging:

```typescript
const client = await createGeminiClient({
  onEvent: (event) => {
    // event.type: "process_started" | "session_opened" | "prompt_started"
    //   | "prompt_completed" | "prompt_failed" | "permission_requested"
    //   | "permission_resolved" | "session_closed" | "warm_session_ready" | ...
    console.log(`[${event.type}]`, event);
  },
});
```

## Raw ACP Escape Hatch

Call any ACP method directly when the library doesn't wrap it yet:

```typescript
const result = await client.rawRequest("session/some_new_method", { sessionId, foo: "bar" });
```

## Timeouts

By default, prompts run indefinitely — the agent works until it finishes or you call `session.cancel()`. To enforce a time limit, set `promptTimeoutMs` at the client or session level:

```typescript
// Client-level: applies to all sessions
const client = await createGeminiClient({
  promptTimeoutMs: 300_000, // 5 minutes
});

// Session-level: overrides client default
const session = await client.openSession({
  promptTimeoutMs: 60_000, // 1 minute for this session
});
```

A `GeminiTimeoutError` is thrown if the prompt exceeds the configured limit.

## Client Options

```typescript
const client = await createGeminiClient({
  binaryPath: "gemini",         // default
  cwd: process.cwd(),           // default
  warmStart: false,              // default
  warmStartTimeoutMs: 30_000,    // default
  promptTimeoutMs: undefined,    // default (no timeout)
  mcpServers: [],                // MCP tool servers
  onPermissionRequest: handler,  // default permission handler
  onEvent: (event) => {},        // lifecycle events
  logger: { debug, info, warn, error },
  onProtocolError: (err) => {},
});
```

## Error Handling

```typescript
import {
  GeminiProcessError,     // CLI failed to start
  GeminiProtocolError,    // ACP protocol violation
  GeminiTimeoutError,     // request or prompt timed out
  GeminiRequestError,     // ACP method call failed
  GeminiSessionClosedError,
  GeminiSessionBusyError, // concurrent prompt or duplicate consumer
} from "@nsalerni/gemini-acp";
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ENOENT` / binary not found | Install [Gemini CLI](https://ai.google.dev/gemini-cli) or pass `binaryPath` |
| Auth errors | Run `gemini auth login` |
| Timeouts | Set or increase `promptTimeoutMs`; check network connectivity |
| `GeminiSessionBusyError` | Only one `send()`/`updates()` consumer per turn; only one prompt at a time |
| Hung process | `pkill -f "gemini --acp"` and retry |

Use `preflightGemini()` to diagnose issues before creating a client.

## Compatibility

| Library | ACP Version | Gemini CLI |
|---------|-------------|-----------|
| 0.1.x   | 1           | 0.30+     |

## Architecture

```
Your App → GeminiClient → GeminiAcpBroker → Gemini CLI (--acp)
                            (session multiplexing, JSON-RPC over stdio)
```

## Testing

```bash
npm test          # watch mode
npm run test:run  # single run
```

## License

MIT

## Resources

- [Gemini CLI Docs](https://ai.google.dev/gemini-cli)
- [Examples](examples/)
- [API Types](src/types.ts)
- [GitHub Issues](https://github.com/nsalerni/gemini-acp/issues)
