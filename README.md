# gemini-acp

[![CI](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml/badge.svg)](https://github.com/nsalerni/gemini-acp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@nsalerni/gemini-acp)](https://www.npmjs.com/package/@nsalerni/gemini-acp)
[![npm downloads](https://img.shields.io/npm/dm/@nsalerni/gemini-acp)](https://www.npmjs.com/package/@nsalerni/gemini-acp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Socket Badge](https://badge.socket.dev/npm/package/@nsalerni/gemini-acp)](https://socket.dev/npm/package/@nsalerni/gemini-acp)

A Node.js library for communicating with the Gemini CLI over the **ACP (Agent Control Protocol)**. Stream agentic responses, handle permissions, and manage sessions with full TypeScript support.

## Installation

```bash
npm install @nsalerni/gemini-acp
```

**Requirements:** Node.js 18+, [Gemini CLI](https://ai.google.dev/gemini-cli) v0.30+

## Quick Start

```typescript
import { createGeminiClient } from "@nsalerni/gemini-acp";

const client = await createGeminiClient();
const session = await client.openSession({ cwd: process.cwd() });

await session.prompt([{ type: "text", text: "List TypeScript files" }]);

for await (const update of session.updates()) {
  if (update.sessionUpdate === "agent_message_chunk") {
    process.stdout.write(update.content?.text ?? "");
  }
}

await session.close();
await client.close();
```

## Features

- **Full ACP Protocol** – Bidirectional JSON-RPC communication
- **Streaming Updates** – Real-time agent messages, reasoning, tool calls
- **Session Management** – Create, resume, and manage multiple sessions
- **Two Execution Modes** – `"yolo"` (auto-execute) or `"plan"` (approval-based)
- **Permission Handling** – Callback-based tool approval system
- **Warm Start** – Eliminate cold-start delays with background initialization
- **TypeScript First** – Full type safety, exported types
- **Error Types** – Specific error classes for different failure modes

## Core API

### Client

```typescript
const client = await createGeminiClient({
  binaryPath: "gemini",              // default
  cwd: process.cwd(),
  warmStart: true,                   // faster first session
  warmStartTimeoutMs: 30_000,
  logger: { debug, info, warn, error },
  onProtocolError: (error) => {},
});

await client.close();
```

### Sessions

```typescript
const session = await client.openSession({
  cwd: "/path/to/project",
  model: "gemini-3-flash-preview",   // optional
  mode: "yolo",                      // or "plan"
  onPermissionRequest: async (req) => { /* handle approval */ },
});

console.log(session.id);
console.log(session.currentModel);

await session.close();
```

### Prompts & Updates

```typescript
// Send prompt with text and/or images
await session.prompt([
  { type: "text", text: "..." },
  { type: "image", mimeType: "image/png", data: "base64..." },
]);

// Stream updates in real-time
for await (const update of session.updates()) {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      process.stdout.write(update.content?.text ?? "");
      break;
    case "tool_call":
      console.log(`Tool: ${update.title}`);
      break;
    case "plan":
      console.log(`Plan: ${update.entries.map(e => e.content).join("\n")}`);
      break;
  }
}
```

### Control

```typescript
await session.setMode("plan");           // Switch execution mode
await session.setModel("gemini-2-pro");  // Change model
await session.cancel();                  // Cancel running prompt
```

## Modes

| Mode | Behavior |
|------|----------|
| `"yolo"` | Agent executes tools immediately |
| `"plan"` | Agent proposes a plan; tools require `onPermissionRequest` approval |

## Permission Handling

```typescript
const session = await client.openSession({
  cwd: process.cwd(),
  mode: "plan",
  onPermissionRequest: async (request) => {
    console.log(`Approve ${request.title}?`);
    // Return { approved: true } or { approved: false }
  },
});
```

## Session Resumption

```typescript
// Save session ID
const sessionId = session.id;

// Later, resume the same conversation
const resumed = await client.openSession({
  cwd: process.cwd(),
  resumeSessionId: sessionId,
});
```

## Warm Start

Start the Gemini process in the background to eliminate cold-start delays:

```typescript
const client = await createGeminiClient({
  warmStart: true,
  warmStartTimeoutMs: 30_000,
});

// First openSession is fast (process already running)
const session = await client.openSession({ cwd: process.cwd() });
```

## Error Handling

```typescript
import {
  GeminiProcessError,
  GeminiProtocolError,
  GeminiTimeoutError,
  GeminiRequestError,
  GeminiSessionNotFoundError,
  GeminiPermissionError,
} from "@nsalerni/gemini-acp/errors";

try {
  const client = await createGeminiClient();
} catch (error) {
  if (error instanceof GeminiProcessError) {
    // Gemini CLI failed to start
  } else if (error instanceof GeminiProtocolError) {
    // ACP protocol violation
  } else if (error instanceof GeminiTimeoutError) {
    // Request timed out
  }
}
```

## Helpers

```typescript
import { imageFileToContentBlock } from "@nsalerni/gemini-acp/helpers";

const imageBlock = await imageFileToContentBlock("screenshot.png");
await session.prompt([
  { type: "text", text: "What's in this image?" },
  imageBlock,
]);
```

## Types

Full type definitions are included. Key interfaces:

```typescript
interface GeminiClientOptions {
  binaryPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: GeminiLogger;
  onProtocolError?: (error: Error) => void;
  warmStart?: boolean;
  warmStartTimeoutMs?: number;
}

interface GeminiSessionOptions {
  cwd: string;
  resumeSessionId?: string;
  model?: string;
  mode?: "plan" | "yolo";
  onPermissionRequest?: PermissionHandler;
}

interface GeminiSession {
  readonly id: string;
  readonly currentModel?: string;
  prompt(blocks: GeminiContentBlock[]): Promise<void>;
  setMode(mode: "plan" | "yolo"): Promise<void>;
  setModel(modelId: string): Promise<void>;
  cancel(): Promise<void>;
  updates(): AsyncIterable<GeminiSessionUpdate>;
  close(): Promise<void>;
}

type GeminiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };
```

See [types documentation](src/types.ts) for complete definitions.

## Examples

See the [examples](examples/) directory for:
- Basic usage
- Image handling
- Permission requests
- Session resumption
- Warm start initialization

## Limitations

- **No auto-restart**: Process crashes require manual reconnection
- **No session persistence**: Save session IDs manually for resumption
- **Node.js only**: Requires locally installed Gemini CLI
- **Plan mode approvals**: All permission requests must be handled via callbacks

## Architecture

```
Your App
    ↓
GeminiAcpClient (JSON-RPC over stdio)
    ↓
GeminiAcpBroker (session multiplexing, permissions)
    ↓
Gemini CLI (--acp mode)
```

## Compatibility

| Library | ACP Version | Gemini CLI |
|---------|-------------|-----------|
| 0.1.x   | 1           | 0.30+     |

## Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
npm run typecheck # Type check only
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

## Resources

- [Gemini CLI Docs](https://ai.google.dev/gemini-cli)
- [GitHub Issues](https://github.com/nsalerni/gemini-acp/issues)
