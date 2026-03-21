# gemini-acp

[![npm version](https://img.shields.io/npm/v/@nsalerni/gemini-acp)](https://www.npmjs.com/package/@nsalerni/gemini-acp)
[![CI](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml/badge.svg)](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Talk to the [Gemini CLI](https://ai.google.dev/gemini-cli) from Node.js over the **ACP (Agent Control Protocol)**. Stream agent responses, handle tool approvals, and manage sessions — all fully typed.

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
await session.prompt("Explain this codebase");
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

## Modes & Permissions

| Mode | Behavior |
|------|----------|
| `"yolo"` | Agent executes tools immediately (default) |
| `"plan"` | Agent proposes a plan; tools require approval |

```typescript
const session = await client.openSession({
  model: "gemini-3.1",
  mode: "plan",
  onPermissionRequest: async (request) => {
    const allow = request.options.find(o => o.kind === "allow_once");
    if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
    return { outcome: { outcome: "cancelled" } };
  },
});
```

## Session Resumption

```typescript
const session = await client.openSession({ model: "gemini-3.1-flash" });
const savedId = session.id;
await session.close();

// Later — resume the same conversation
const resumed = await client.openSession({ resumeSessionId: savedId });
```

## Warm Start

Pre-initialize a background session so `openSession()` is near-instant:

```typescript
const client = await createGeminiClient({ warmStart: true });
const session = await client.openSession({ model: "gemini-3.1-flash" }); // fast
```

## Client Options

```typescript
const client = await createGeminiClient({
  binaryPath: "gemini",         // default
  cwd: process.cwd(),           // default
  warmStart: false,              // default
  warmStartTimeoutMs: 30_000,    // default
  logger: { debug, info, warn, error },
  onProtocolError: (err) => {},
});
```

## Error Handling

```typescript
import {
  GeminiProcessError,     // CLI failed to start
  GeminiProtocolError,    // ACP protocol violation
  GeminiTimeoutError,     // request timed out
  GeminiRequestError,     // ACP method call failed
  GeminiSessionClosedError,
} from "@nsalerni/gemini-acp";
```

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
