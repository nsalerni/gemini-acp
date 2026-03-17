# Warm Start Feature

## Overview

The warm start feature enables **fast first prompts** for long-lived applications by pre-initializing a background Gemini CLI session when the client is created.

## Motivation

In applications like ncode where users maintain persistent connections and open multiple threads/conversations, the cold start delay of initializing Gemini CLI (~2-3 seconds) becomes noticeable and impacts UX.

Warm start eliminates this delay by:
1. Starting Gemini CLI in the background during client initialization
2. Reusing that session for the first `openSession()` call
3. Automatically preparing the next warm session for subsequent calls

## How It Works

### With Warm Start Enabled

```
createGeminiClient({ warmStart: true })
    ↓
Broker created + warm session starts in background (non-blocking)
    ↓
Returns immediately to caller
    ↓
[Meanwhile, background warm session is initializing...]
    ↓
openSession()  →  Reuses warm session (100-200ms)
    ↓
[Background prepares next warm session]
    ↓
openSession()  →  Reuses prepared warm session (100-200ms)
    ↓
close()  →  Releases warm session
```

### Without Warm Start

```
createGeminiClient()
    ↓
Broker created
    ↓
Returns immediately
    ↓
openSession()  →  Initializes new Gemini CLI (2-3s)
    ↓
openSession()  →  Initializes new Gemini CLI (2-3s)
```

## API Usage

### Simple Usage

```typescript
const client = await createGeminiClient({
  binaryPath: "gemini",
  cwd: process.cwd(),
  warmStart: true,           // Enable warm start
  warmStartTimeoutMs: 30_000, // Timeout for warm session init
});

// Fast first session (reuses warm session)
const session1 = await client.openSession({ cwd: "." });

// Also fast (new warm session prepared)
const session2 = await client.openSession({ cwd: "." });

await session1.close();
await session2.close();
await client.close();
```

### With Logger

```typescript
const client = await createGeminiClient({
  warmStart: true,
  logger: {
    info: (msg) => console.log("[INFO]", msg),
    debug: (msg) => console.log("[DEBUG]", msg),
  },
});

// Output:
// [INFO] Starting warm session...
// [INFO] Warm session ready
// [INFO] Closing client...
```

## Configuration

### `warmStart: boolean`
- **Default**: `false`
- **Description**: Enable background warm session initialization
- **Opt-in**: Existing code continues to work unchanged

### `warmStartTimeoutMs: number`
- **Default**: `30_000` (30 seconds)
- **Description**: Maximum time to wait for warm session initialization
- **Behavior**: If timeout occurs, warm session is skipped (graceful degradation)

## Performance Characteristics

### Timing Comparison

| Operation | Cold Start | Warm Start |
|-----------|-----------|-----------|
| Client creation | ~100ms | ~100ms |
| First `openSession()` | 2-3s | 100-200ms |
| Subsequent `openSession()` | 2-3s each | 100-200ms each |

### Per 10 Threads Opened

- **Cold Start**: 20-30 seconds total overhead
- **Warm Start**: 1-2 seconds total overhead
- **Savings**: 18-28 seconds! 🚀

## Implementation Details

### Warm Session State

The client maintains a single warm session state:
- `#warmSession`: Currently available warm session (if any)
- `#warmSessionPending`: Promise tracking ongoing warm session startup

### Session Lifecycle

1. **Initialization**
   - `createGeminiClient()` called with `warmStart: true`
   - `startWarmSession()` invoked in background (non-blocking)
   - Client returned to caller

2. **First Consumption**
   - `openSession()` called by user
   - Library checks: warm session available?
   - If yes: reuse it (take ownership)
   - Start preparing next warm session in background

3. **Subsequent Calls**
   - Warm session prepared from step 2 is reused
   - Next warm session prepared automatically
   - Pattern continues for each call

4. **Cleanup**
   - `close()` called on session → session detached
   - Background warm session preparation may continue
   - `client.close()` releases warm session and stops broker

### Fallback Behavior

If warm session startup fails or times out:
- Warning is logged
- Library gracefully falls back to cold session initialization
- User code continues to work normally
- Performance degrades to cold start times for that session

## Use Cases

### ✅ Ideal For

- **GUI Applications** (ncode): Multiple threads with fast switching
- **Chat Servers**: Multiple concurrent conversations
- **IDE Extensions**: Always-on agent assistance
- **Interactive CLI Tools**: Quick turnaround between commands
- **Long-Lived Applications**: Keep agent warm throughout session

### ❌ Not Ideal For

- **One-shot CLI Tools**: Single command then exit (overhead)
- **Serverless Functions**: No persistent connection
- **Limited Resources**: Keeps Gemini CLI memory allocated

## Graceful Degradation

Warm start is designed to fail gracefully:

1. **Timeout**: If warm session init exceeds timeout, skip it
2. **Error**: If warm session init errors, continue without it
3. **Resource Constraints**: Works fine even without warm session

The library will never break due to warm start — it's strictly a performance optimization.

## Example: ncode Integration

```typescript
// app initialization
const geminiClient = await createGeminiClient({
  binaryPath: "gemini",
  cwd: appConfig.projectRoot,
  warmStart: true,
  logger: appLogger,
});

// user opens a thread
const threadSession = await geminiClient.openSession({
  cwd: threadConfig.cwd,
  model: threadConfig.preferredModel,
});

// user interacts with thread
const userInput = await getUserInput();
await threadSession.prompt([{ type: "text", text: userInput }]);

for await (const update of threadSession.updates()) {
  // Display updates to user
}

// user closes thread
await threadSession.close();

// Warm session is ready for next thread!
```

## Monitoring & Debugging

### Via Logger

```typescript
const client = await createGeminiClient({
  warmStart: true,
  logger: {
    debug: (msg, meta) => {
      console.log(`[DEBUG] ${msg}`, meta);
      // Logs:
      // [DEBUG] Starting warm session...
      // [DEBUG] Sending request: session/new
      // [DEBUG] Taking warm session { sessionId: "..." }
      // [DEBUG] Starting warm session...
    },
    info: (msg, meta) => {
      console.log(`[INFO] ${msg}`, meta);
      // Logs:
      // [INFO] Warm session ready { sessionId: "..." }
      // [INFO] Session opened { fromWarm: true }
    },
    warn: (msg, meta) => {
      console.warn(`[WARN] ${msg}`, meta);
      // Logs:
      // [WARN] Failed to warm start session
    },
  },
});
```

### Performance Measurement

```typescript
const startTime = Date.now();

const client = await createGeminiClient({ warmStart: true });
console.log(`Client init: ${Date.now() - startTime}ms`);

const t1 = Date.now();
const session = await client.openSession({ cwd: "." });
console.log(`First session: ${Date.now() - t1}ms`);

const t2 = Date.now();
const session2 = await client.openSession({ cwd: "." });
console.log(`Second session: ${Date.now() - t2}ms`);
```

## Testing Warm Start

See `examples/05-warm-start.ts` for a complete working example that:
- Creates a client with warm start enabled
- Measures first session opening time
- Measures second session opening time
- Demonstrates timing improvements

Run it with:
```bash
npx ts-node examples/05-warm-start.ts
```

## Limitations & Known Issues

1. **Single Warm Session**: Only one warm session is maintained per client
   - Solution: Works fine for most applications
   - Multiple clients can be created if needed

2. **No Session Persistence**: Warm session is reset on error
   - Solution: Graceful fallback to cold session

3. **Memory**: Gemini CLI stays in memory as long as client is open
   - Solution: Call `client.close()` when done

4. **Not Safe for Serverless**: Warm session keeps connection open
   - Solution: Use without `warmStart` in serverless contexts

## Future Improvements

- [ ] Per-CWD warm sessions (for multi-project applications)
- [ ] Configurable warm session count
- [ ] Metrics tracking (warm hit rate, init time, etc.)
- [ ] Automatic warm session refresh on error

## References

- **Example**: `examples/05-warm-start.ts`
- **Implementation**: `src/client.ts` - `GeminiClientImpl.startWarmSession()`
- **Configuration**: `src/types.ts` - `GeminiClientOptions`
- **Documentation**: `README.md` - Client creation section
