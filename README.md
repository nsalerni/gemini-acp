# gemini-acp

A Node.js library for communicating with the Gemini CLI over the **ACP (Agent Control Protocol)** via stdio. This library allows you to leverage your local Gemini CLI installation and expose it as a managed agent with full streaming support, session persistence, and permission handling.

## Features

- **Full ACP Protocol Support**: Implements the complete Agent Control Protocol for bidirectional communication
- **Streaming Updates**: Receive real-time agent messages, reasoning, tool calls, and plan updates via async iterables
- **Session Management**: Create, resume, and manage multiple Gemini sessions with proper lifecycle handling
- **Model Selection**: Switch between different Gemini models at runtime
- **Permission Handling**: Callback-based permission request handling for tool execution approvals
- **Graceful Shutdown**: Proper resource cleanup and process termination
- **Error Handling**: Comprehensive error types for debugging and recovery
- **TypeScript First**: Full type safety with generated `.d.ts` files

## Installation

```bash
npm install gemini-acp
# or
yarn add gemini-acp
```

### Prerequisites

- Node.js 18+
- [Gemini CLI](https://ai.google.dev/gemini-cli) installed and authenticated
- `gemini --acp` support (Gemini CLI v0.0.32+)

## Quick Start

```typescript
import { createGeminiClient } from "gemini-acp";

// Create a client connected to the local Gemini CLI
const client = await createGeminiClient({
  binaryPath: "gemini", // default: looks in PATH
  cwd: process.cwd(),
});

// Open a session
const session = await client.openSession({
  cwd: process.cwd(),
  model: "gemini-2.0-flash",
  mode: "yolo", // or "plan" for approval-required mode
});

// Send a prompt and stream updates
await session.prompt([
  {
    type: "text",
    text: "What are the top 3 files in the current directory?",
  },
]);

// Subscribe to updates
for await (const update of session.updates()) {
  console.log("Update:", update);

  if (
    update.sessionUpdate === "agent_message_chunk"
  ) {
    process.stdout.write(update.content?.text ?? "");
  }

  if (update.sessionUpdate === "tool_call") {
    console.log(`Tool called: ${update.title} (${update.kind})`);
  }
}

// Clean up
await session.close();
await client.close();
```

## Usage Guide

### 1. Creating a Client

The client is the entry point to the Gemini ACP protocol. It spawns a Gemini CLI subprocess and manages the JSON-RPC communication.

```typescript
import { createGeminiClient } from "gemini-acp";

const client = await createGeminiClient({
  // Path to gemini binary. Optional, defaults to "gemini" (uses PATH)
  binaryPath: "/usr/local/bin/gemini",

  // Working directory for the Gemini CLI process
  cwd: process.cwd(),

  // Optional environment variables to pass to the process
  env: { ...process.env, GEMINI_LOG_LEVEL: "debug" },

  // Optional logger for debug output
  logger: {
    debug: (msg) => console.log("[DEBUG]", msg),
    info: (msg) => console.log("[INFO]", msg),
    warn: (msg) => console.warn("[WARN]", msg),
    error: (msg) => console.error("[ERROR]", msg),
  },

  // Optional handler for protocol-level errors
  onProtocolError: (error) => {
    console.error("Protocol error:", error);
  },

  // Timeouts and resource limits
  requestTimeoutMs: 15_000,
  stderrBufferLimit: 16_000,
});
```

### 2. Opening Sessions

Sessions are independent conversations with the Gemini agent. You can have multiple sessions open simultaneously.

```typescript
// Create a new session
const session = await client.openSession({
  cwd: "/path/to/project",
  model: "gemini-2.0-flash", // optional
  mode: "yolo", // or "plan"
});

console.log("Session ID:", session.id);
console.log("Current model:", session.currentModel);

// Resume a previous session (if you saved the session ID)
const resumedSession = await client.openSession({
  cwd: "/path/to/project",
  resumeSessionId: "previously-saved-session-id",
});
```

**Modes:**
- `"yolo"`: Agent executes tools immediately without approval (full-access mode)
- `"plan"`: Agent proposes a plan first; permission requests must be handled via the `onPermissionRequest` callback

### 3. Sending Prompts

Prompts can include text and image blocks. The agent will stream responses back via updates.

```typescript
import { readFileSync } from "fs";

// Text-only prompt
await session.prompt([
  {
    type: "text",
    text: "List all TypeScript files in src/",
  },
]);

// Prompt with an image
const imageData = readFileSync("screenshot.png").toString("base64");
await session.prompt([
  {
    type: "text",
    text: "Describe this screenshot",
  },
  {
    type: "image",
    mimeType: "image/png",
    data: imageData,
  },
]);

// Helper for loading image files
import { imageFileToContentBlock } from "gemini-acp/helpers";

const imageBlock = await imageFileToContentBlock("screenshot.png");
await session.prompt([
  { type: "text", text: "What's in this image?" },
  imageBlock,
]);
```

### 4. Streaming Updates

Updates are streamed back from the agent in real-time. Use `for await...of` to consume them:

```typescript
for await (const update of session.updates()) {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      // Agent is responding with text
      process.stdout.write(update.content?.text ?? "");
      break;

    case "agent_thought_chunk":
      // Agent's internal reasoning (if enabled)
      console.log("[THINKING]", update.content?.text);
      break;

    case "tool_call":
      // Agent is calling a tool
      console.log(`\n[TOOL] ${update.title}`);
      console.log("  Status:", update.status);
      console.log("  Kind:", update.kind);
      console.log("  Input:", update.rawInput);
      break;

    case "tool_call_update":
      // Tool execution progress or completion
      console.log(`[TOOL UPDATE] ${update.title}: ${update.status}`);
      if (update.status === "completed") {
        console.log("  Output:", update.rawOutput);
      }
      break;

    case "plan":
      // Planning phase updates (plan mode only)
      console.log("[PLAN]");
      for (const entry of update.entries) {
        console.log(`  - [${entry.status}] ${entry.content}`);
      }
      break;

    case "session_info_update":
      // Session title or metadata updated
      if (update.title) {
        console.log("Session title:", update.title);
      }
      break;

    case "current_mode_update":
      // Mode changed
      console.log("Mode:", update.currentModeId);
      break;

    default:
      // Ignore other updates
      break;
  }
}

console.log("Prompt completed");
```

### 5. Permission Handling

When running in `"plan"` mode or when tools request approval, you must handle permission requests:

```typescript
const session = await client.openSession({
  cwd: process.cwd(),
  mode: "plan",
  onPermissionRequest: async (request) => {
    console.log("Permission requested:", request);
    console.log("Available options:");
    for (const option of request.options) {
      console.log(`  - ${option.optionId}: ${option.kind}`);
    }

    // For this example, auto-allow
    const allowOption = request.options.find(
      (opt) => opt.kind === "allow_once" || opt.kind === "allow_always"
    );

    if (allowOption) {
      return {
        outcome: {
          outcome: "selected",
          optionId: allowOption.optionId,
        },
      };
    }

    // Or reject
    return {
      outcome: {
        outcome: "cancelled",
      },
    };
  },
});
```

### 6. Session Control

```typescript
// Change the mode mid-session
await session.setMode("plan");
await session.setMode("yolo");

// Switch to a different model
await session.setModel("gemini-2.0-flash");

// Cancel a running prompt
await session.cancel();

// Close the session (detaches local route, but remote session remains resumable)
await session.close();
```

### 7. Client Cleanup

Always close the client to properly terminate the Gemini CLI subprocess:

```typescript
// Close all sessions (optional; automatic on client close)
for (const session of openSessions) {
  await session.close();
}

// Gracefully shut down the client
await client.close();

// Wait for process to fully exit
await client.closed; // Resolves when process exits
```

## Advanced Examples

### Multi-Session Conversation

```typescript
import { createGeminiClient } from "gemini-acp";

const client = await createGeminiClient();

const session1 = await client.openSession({
  cwd: "/project/frontend",
  model: "gemini-2.0-flash",
});

const session2 = await client.openSession({
  cwd: "/project/backend",
  model: "gemini-2.0-flash",
});

// Both sessions run independently
await Promise.all([
  (async () => {
    await session1.prompt([{ type: "text", text: "Fix all linting errors" }]);
    for await (const update of session1.updates()) {
      console.log("[Frontend]", update);
    }
  })(),
  (async () => {
    await session2.prompt([
      { type: "text", text: "Write database migrations" },
    ]);
    for await (const update of session2.updates()) {
      console.log("[Backend]", update);
    }
  })(),
]);

await session1.close();
await session2.close();
await client.close();
```

### Using Isolated Gemini Home

To avoid interfering with your main Gemini CLI configuration, use an isolated home directory:

```typescript
import { createIsolatedGeminiHome } from "gemini-acp/helpers";

const isolatedHome = await createIsolatedGeminiHome({
  stateDir: "/tmp/gemini-acp-app",
});

// Gemini will use the isolated home, copying necessary auth files
const client = await createGeminiClient({
  env: isolatedHome.env,
  cwd: process.cwd(),
});

// ... use client ...

await client.close();
```

### Interactive CLI with Permission Callbacks

```typescript
import { createGeminiClient } from "gemini-acp";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> =>
  new Promise((resolve) => rl.question(prompt, resolve));

const client = await createGeminiClient({
  binaryPath: "gemini",
  cwd: process.cwd(),
});

const session = await client.openSession({
  cwd: process.cwd(),
  mode: "plan",
  onPermissionRequest: async (request) => {
    console.log("\n🔒 Permission Request:");
    for (let i = 0; i < request.options.length; i++) {
      const option = request.options[i];
      console.log(
        `${i + 1}. ${option.kind} (ID: ${option.optionId})`
      );
    }

    const choice = await question("Select option (1-3): ");
    const idx = parseInt(choice) - 1;

    if (idx >= 0 && idx < request.options.length) {
      return {
        outcome: {
          outcome: "selected",
          optionId: request.options[idx].optionId,
        },
      };
    }

    return { outcome: { outcome: "cancelled" } };
  },
});

// Read user input and send prompts
while (true) {
  const input = await question("\n> ");
  if (input.toLowerCase() === "exit") break;

  await session.prompt([{ type: "text", text: input }]);

  for await (const update of session.updates()) {
    if (update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(update.content?.text ?? "");
    }
  }

  console.log("\n");
}

rl.close();
await session.close();
await client.close();
```

## Error Handling

The library provides specific error types for different failure modes:

```typescript
import {
  GeminiError,
  GeminiProcessError,
  GeminiProtocolError,
  GeminiRequestError,
  GeminiTimeoutError,
  GeminiSessionNotFoundError,
  GeminiPermissionError,
} from "gemini-acp/errors";

try {
  const client = await createGeminiClient();
  // ... use client ...
} catch (error) {
  if (error instanceof GeminiProcessError) {
    console.error("Failed to spawn Gemini CLI:", error.message);
  } else if (error instanceof GeminiProtocolError) {
    console.error("ACP protocol violation:", error.message);
  } else if (error instanceof GeminiTimeoutError) {
    console.error("Request timed out:", error.message);
  } else if (error instanceof GeminiRequestError) {
    console.error("ACP request failed:", error.message);
  } else if (error instanceof GeminiSessionNotFoundError) {
    console.error("Session not found:", error.message);
  } else {
    console.error("Unknown error:", error);
  }
}
```

## Types

### Core Types

```typescript
interface GeminiClientOptions {
  binaryPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  stderrBufferLimit?: number;
  logger?: GeminiLogger;
  onProtocolError?: (error: Error) => void;
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

type GeminiSessionUpdate =
  | {
      sessionUpdate: "agent_message_chunk" | "agent_thought_chunk";
      content?: { type?: string; text?: string };
    }
  | {
      sessionUpdate: "tool_call" | "tool_call_update";
      toolCallId: string;
      title: string;
      status?: "pending" | "in_progress" | "completed" | "failed";
      kind?: "execute" | "read" | "edit" | "delete" | "move" | "search" | "fetch" | "other";
      content?: Array<...>;
      rawInput?: unknown;
      rawOutput?: unknown;
    }
  | {
      sessionUpdate: "plan";
      entries: Array<{ content: string; status: string }>;
    }
  | ... // See types.ts for full definitions
```

## API Reference

### `createGeminiClient(options?)`

Creates a new Gemini ACP client.

**Returns:** `Promise<GeminiClient>`

### `client.openSession(options)`

Opens a new Gemini session or resumes an existing one.

**Returns:** `Promise<GeminiSession>`

### `session.prompt(blocks)`

Sends a prompt to the agent and streams updates back.

**Returns:** `Promise<void>` (resolves when agent finishes)

### `session.updates()`

Returns an async iterable of all updates from the agent.

**Returns:** `AsyncIterable<GeminiSessionUpdate>`

### `session.setMode(mode)`

Changes the session mode to "plan" or "yolo".

**Returns:** `Promise<void>`

### `session.setModel(modelId)`

Switches to a different Gemini model.

**Returns:** `Promise<void>`

### `session.cancel()`

Cancels the currently running prompt.

**Returns:** `Promise<void>`

### `session.close()`

Closes the session (detaches local route).

**Returns:** `Promise<void>`

### `client.close()`

Gracefully shuts down the client and kills the Gemini CLI process.

**Returns:** `Promise<void>`

### `client.closed`

A promise that resolves when the process has exited.

**Type:** `Promise<void>`

## How It Works: ncode Integration Background

The `gemini-acp` library extracts the core ACP communication layer from [ncode](https://github.com/yourorg/ncode), a GUI-based multi-agent orchestration platform. In ncode, Gemini is one of several available agents, and this library provides the protocol implementation that enables:

1. **Multi-Agent Orchestration**: Multiple Gemini sessions can run in parallel, each with independent state and permissions
2. **Event Streaming**: Real-time access to agent reasoning, tool calls, and outputs
3. **Session Persistence**: Save and resume agent sessions across application restarts
4. **Permission Control**: Explicit approval workflows for tool execution
5. **Plan Mode**: Separate planning and execution phases for approval-required scenarios

This library is the **protocol-only** layer, making it reusable without ncode's UI, event system, or runtime abstractions.

## Architecture

```
┌─────────────────────────────────────────┐
│    Your Application                      │
└──────────────┬──────────────────────────┘
               │
        createGeminiClient()
               │
        ┌──────▼──────────────────┐
        │  GeminiAcpClient        │  JSON-RPC over stdio
        │  - Request tracking      │
        │  - Line-oriented parsing │
        │  - Timeout handling      │
        └──────┬──────────────────┘
               │
        ┌──────▼──────────────────┐
        │  GeminiAcpBroker        │  Session routing
        │  - Multiplex sessions   │
        │  - Permission handling  │
        │  - Route management     │
        └──────┬──────────────────┘
               │
        ┌──────▼──────────────────┐
        │  Gemini CLI (--acp)     │
        │  - Agentic execution    │
        │  - Tool calling         │
        │  - Model interaction    │
        └─────────────────────────┘
```

## Compatibility

| Library Version | ACP Version | Tested Gemini CLI |
| --------------- | ----------- | ------------------- |
| 0.1.x           | 1           | 0.0.32+             |

## Limitations & Known Issues

1. **No automatic process restart**: If the Gemini CLI process crashes, the library will raise an error. Applications must handle reconnection.
2. **No session persistence to disk**: The library provides `resumeSessionId` for in-memory resumption, but you must manually persist and restore session IDs.
3. **Plan mode approval**: In ncode, there's a UI for approval workflows. With this library, you must handle all approvals via the `onPermissionRequest` callback.
4. **No Web support**: This is a Node.js library only; Gemini CLI must be locally installed.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

### Running Tests

```bash
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run typecheck # Type-check without running
```

### Test Structure

- **Unit tests**: Fast, deterministic protocol and lifecycle tests
- **Contract tests**: Tests against a fake ACP server (no real Gemini CLI required)
- **Integration tests** (optional): Real Gemini CLI tests (run with `GEMINI_ACP_INTEGRATION_TESTS=1`)

## License

MIT

## Acknowledgments

This library is extracted from [ncode](https://github.com/yourorg/ncode), a multi-agent GUI platform. Thanks to the ncode team for the original implementation and battle-tested ACP integration.

## Related Resources

- [Gemini CLI Documentation](https://ai.google.dev/gemini-cli)
- [ACP Protocol Specification](https://modelcontextprotocol.io/)
- [ncode Repository](https://github.com/yourorg/ncode)

## Support

For issues, questions, or contributions:
- GitHub Issues: [Create an issue](https://github.com/yourorg/gemini-acp/issues)
- Documentation: [Full docs](https://github.com/yourorg/gemini-acp#readme)
