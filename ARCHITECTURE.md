# Architecture: gemini-acp

## Overview

`gemini-acp` is a Node.js library for communicating with the Gemini CLI over the **ACP (Agent Control Protocol)** via standard input/output streams. The library provides a clean, typed abstraction over the JSON-RPC-based protocol.

## System Architecture

```
┌─────────────────────────────────────┐
│   Your Application Code             │
│   (uses GeminiClient)               │
└──────────────┬──────────────────────┘
               │
               │ createGeminiClient()
               │ client.openSession()
               │
        ┌──────▼──────────────────────┐
        │  GeminiClientImpl            │ Public API
        │  - Client lifecycle         │
        │  - Session management       │
        └──────┬──────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │  GeminiAcpBroker            │ Protocol Multiplexing
        │  - Multiple sessions        │
        │  - Route management         │
        │  - Permission handling      │
        └──────┬──────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │  JsonRpcStdioClient         │ JSON-RPC Transport
        │  - Spawn process            │
        │  - Line-oriented parsing    │
        │  - Request correlation      │
        │  - Timeout management       │
        └──────┬──────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │  Gemini CLI (--acp)         │ Agent Execution
        │  - ACP server               │
        │  - Tool calling             │
        │  - Model interaction        │
        └─────────────────────────────┘
```

## Core Components

### 1. **JsonRpcStdioClient** (`src/JsonRpcStdioClient.ts`)

Lowest-level transport layer handling:
- **Process Management**: Spawns Gemini CLI with `--acp` flag
- **JSON-RPC**: Sends/receives JSON-RPC 2.0 messages over stdio
- **Request Tracking**: Maps response messages to pending requests by ID
- **Timeouts**: Enforces per-request timeouts and cleanup
- **Error Handling**: Converts protocol errors to library error types
- **Lifecycle**: Manages process stdin/stdout, graceful shutdown

**Key Methods:**
- `static start()` - Initialize and handshake with Gemini CLI
- `request<T>()` - Send a method call, await response
- `notify()` - Send a notification (fire-and-forget)
- `stop()` - Gracefully shutdown the process

### 2. **GeminiAcpBroker** (`src/GeminiAcpBroker.ts`)

Session multiplexing layer:
- **Session Routing**: Routes notifications by `sessionId` to registered routes
- **Lifecycle**: Create/resume sessions via ACP methods
- **Route Registry**: Maps session IDs to handler functions
- **Permission Delegation**: Delegates permission requests to route handlers
- **Mode/Model Management**: Provides methods to change session mode or model

**Key Methods:**
- `openSession()` - Create new or resume existing session
- `setMode()` - Switch to plan/yolo mode
- `setModel()` - Change model
- `prompt()` - Send prompt blocks
- `cancel()` - Cancel running prompt
- `bindSession()` / `releaseSession()` - Route registration

### 3. **GeminiSessionImpl** (`src/GeminiSessionImpl.ts`)

High-level session API:
- **Async Iteration**: Implements `AsyncIterable<GeminiSessionUpdate>`
- **Buffering**: Buffers updates while waiting for consumers
- **State Tracking**: Tracks current model and closed status
- **Route Creation**: Creates and registers route handler with broker
- **Error Propagation**: Surfaces broker errors to consumers

**Key Methods:**
- `prompt()` - Send prompt and wait for completion
- `updates()` - Get async iterable of updates
- `setMode()` / `setModel()` - Session control
- `cancel()` / `close()` - Cancellation and cleanup

### 4. **GeminiClientImpl** (`src/client.ts`)

Public API and application-level management:
- **Singleton Broker**: Manages one broker per unique (binaryPath, cwd) pair
- **Session Lifecycle**: Creates/tracks sessions
- **Options Management**: Handles client options and defaults
- **Cleanup**: Closes all sessions and broker on shutdown

**Key Methods:**
- `static create()` - Factory method
- `openSession()` - Create/resume a session
- `close()` - Shutdown everything gracefully

## Data Flow

### Sending a Prompt

```
Application
    │
    ├─→ session.prompt([blocks])
    │
    ├─→ broker.prompt(sessionId, blocks)
    │
    ├─→ client.request("session/prompt", { sessionId, prompt })
    │
    ├─→ JsonRpcStdioClient writes JSON-RPC to stdin
    │
    ├─→ Gemini CLI receives and executes
    │
    └─→ Promise<void> resolves when server responds
```

### Receiving Updates

```
Gemini CLI
    │
    ├─→ Emits JSON-RPC notification: { "method": "session/update", "params": {...} }
    │
    ├─→ JsonRpcStdioClient reads line from stdout
    │
    ├─→ Routes to broker.handleNotification()
    │
    ├─→ Routes to GeminiAcpBroker.handleSessionUpdate()
    │
    ├─→ Routes to registered BrokerRoute.onSessionUpdate()
    │
    ├─→ GeminiSessionImpl.handleUpdate()
    │
    ├─→ Buffered or delivered to async iterator consumer
    │
    └─→ Application receives via: for await (const update of session.updates())
```

### Permission Requests

```
Gemini CLI
    │
    ├─→ Needs approval, sends JSON-RPC request: { "method": "session/request_permission", ... }
    │
    ├─→ JsonRpcStdioClient routes to broker.handleRequest()
    │
    ├─→ Routes to registered BrokerRoute.onPermissionRequest()
    │
    ├─→ Application decides: approve/reject via callback
    │
    ├─→ JsonRpcStdioClient sends response back to Gemini CLI
    │
    └─→ Gemini CLI continues execution
```

## Key Design Decisions

### 1. **Async Iterable for Updates**
Rather than callbacks or event emitters, `session.updates()` returns an `AsyncIterable`. This allows:
- Backpressure handling (consumer controls pace)
- Clean composition with `async`/`await`
- No global event listeners
- Integration with any framework (RxJS, Effect, etc.)

### 2. **Separation of Concerns**
- `JsonRpcStdioClient` is transport-agnostic (could be WebSocket, etc.)
- `GeminiAcpBroker` is app-agnostic (could drive different UIs)
- Public `types.ts` is ACP-shaped, not runtime-specific
- Error types are minimal and descriptive

### 3. **Single Broker per Process**
One Gemini CLI process is shared across all sessions with the same (binaryPath, cwd). This reduces overhead and is efficient for the typical use case (one app, one agent).

### 4. **No Framework Dependencies**
The library uses only Node.js built-ins:
- `child_process` for spawning
- `readline` for line-oriented parsing
- Standard `Promise`/`async`/`await`
- No Effect, RxJS, or other frameworks

This keeps the library lightweight and composable.

### 5. **Graceful Shutdown**
- `client.close()` closes all sessions and kills the process
- All pending requests are rejected with a meaningful error
- Timeouts are cleaned up
- Process is terminated with SIGTERM (with optional fallback to SIGKILL)

## Error Handling Strategy

### Error Types

| Error | Cause | Recovery |
|-------|-------|----------|
| `GeminiProcessError` | Process spawn/communication failure | Recreate client |
| `GeminiProtocolError` | Invalid JSON-RPC or ACP protocol | Likely unrecoverable |
| `GeminiRequestError` | ACP method call failed | Check parameters |
| `GeminiTimeoutError` | Request exceeded timeout | Increase timeout or cancel |
| `GeminiSessionNotFoundError` | Session doesn't exist | Create new session |
| `GeminiPermissionError` | Permission denied | Request different permission |

### Error Metadata

All errors include:
- `message`: Human-readable description
- `cause`: Original error (if applicable)
- `metadata`: Structured data (method, sessionId, requestId, stderr tail, etc.)

## Session Lifecycle

```
┌─────────────────────────────────────┐
│  client.openSession(options)        │
└──────────────┬──────────────────────┘
               │
         ┌─────▼─────┐
         │   NEW?    │
         └─────┬─────┘
               │
         ┌──YES──NO──┐
         │           │
    [new]        [resume]
         │           │
  session/new   session/load
         │           │
         └─────┬─────┘
               │
        session/set_mode
               │
        (optional: session/set_model)
               │
         ┌─────▼─────────────┐
         │ Ready for Prompts │
         └─────┬─────────────┘
               │
         ┌─────▼──────────────┐
    ┌────┤ session.prompt()   │
    │    └────────┬───────────┘
    │             │
    │      [streaming updates]
    │             │
    │    ┌────────▼─────┐
    │    │   Complete   │
    │    └──────────────┘
    │
    └──────┐ (repeat for more prompts)
           │
      ┌────▼─────────┐
      │ session.close() or
      │ client.close()
      └────────────────┘
```

## Timeouts

- **Request Timeout** (default 15s): Individual ACP method calls
- **Initialization Timeout** (default 15s): Handshake with Gemini CLI
- **Process Timeout**: Graceful shutdown waits for process exit (no timeout)

Timeout behavior: Request is rejected with `GeminiTimeoutError`, but the process remains alive.

## Future Improvements

1. **Configurable Timeouts**: Per-session or per-request timeout overrides
2. **Process Pooling**: Multiple Gemini processes for parallel execution
3. **Session Persistence**: Built-in disk-based session storage
4. **Streaming Request**: Support for streaming prompts instead of waiting for full array
5. **Advanced Logging**: Debug logs for every protocol message
6. **Metrics**: Built-in instrumentation for response times, error rates, etc.

## Testing Strategy

### Unit Tests
- JSON-RPC message parsing
- Request/response correlation
- Timeout behavior
- Pending request cleanup
- Route registration/unregistration

### Contract Tests (Fake ACP Server)
- Full session lifecycle
- Permission request handling
- Error scenarios
- Process shutdown

### Integration Tests (Optional, with Real Gemini CLI)
- End-to-end session creation and prompting
- Streaming updates
- Session resumption

## Performance Considerations

- **Memory**: Buffered updates stored in session; streaming prevents unbounded growth
- **CPU**: Single readline interface; minimal parsing overhead
- **Network/IPC**: Efficient line-oriented JSON; no unnecessary copies
- **Process**: Reuses broker across sessions; only one Gemini CLI per config

Typical resource usage is minimal; the bottleneck is the Gemini CLI itself, not this library.
