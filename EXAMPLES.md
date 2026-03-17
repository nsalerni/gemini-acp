# Examples Guide

This directory contains 5 complete, runnable examples demonstrating all major features of gemini-acp.

## Prerequisites

Before running examples, ensure you have:

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **Gemini CLI installed and authenticated**
   ```bash
   gemini --version          # Should be v0.0.32+
   gemini auth login         # Authenticate if needed
   ```

3. **tsx for running TypeScript directly**
   ```bash
   npm install -g tsx
   # or use: npm run example:01
   ```

## Running Examples

### Option 1: Using npm scripts (Recommended)

```bash
npm run example:01  # Basic prompt
npm run example:02  # With image
npm run example:03  # Permission handling
npm run example:04  # Resume session
npm run example:05  # Warm start feature
```

### Option 2: Using tsx directly

```bash
tsx examples/01-basic.ts
tsx examples/02-with-image.ts
tsx examples/03-permission-handling.ts
tsx examples/04-session-resume.ts
tsx examples/05-warm-start.ts
```

### Option 3: Using ts-node

```bash
npx ts-node examples/01-basic.ts
```

## Example Descriptions

### 01-basic.ts (52 lines)
**What it demonstrates:**
- Creating a Gemini client
- Opening a session
- Sending a simple text prompt
- Streaming and displaying agent responses

**Run it:**
```bash
npm run example:01
```

**Expected output:**
Agent response to "What are the top 5 TypeScript best practices?"

---

### 02-with-image.ts (43 lines)
**What it demonstrates:**
- Loading an image from disk
- Converting it to a base64 content block
- Sending a prompt with image attachment
- Processing agent responses

**Requirements:**
- An `example.png` file in the project root (or modify the path)

**Run it:**
```bash
npm run example:02
```

**Expected output:**
Agent's analysis of the image

---

### 03-permission-handling.ts (97 lines)
**What it demonstrates:**
- Creating a client with plan mode (requires approvals)
- Handling permission requests via callback
- Auto-approving or rejecting permissions
- Streaming plan and agent updates

**Run it:**
```bash
npm run example:03
```

**Expected output:**
- Planning phase with steps
- Permission request (auto-approved)
- Tool execution
- Agent response

---

### 04-session-resume.ts (71 lines)
**What it demonstrates:**
- Creating a session and saving its ID
- Resuming a session from a saved ID
- Continuing conversations across session boundaries

**Run it:**
```bash
npm run example:04
```

**Expected output:**
- Answer to "What is the capital of France?"
- Session resumed message
- Answer to "What's the population?"

---

### 05-warm-start.ts (100 lines)
**What it demonstrates (NEW!):**
- Enabling warm start on client initialization
- Timing comparison between first and second session
- Automatic warm session rotation
- Performance benefits of warm start

**Run it:**
```bash
npm run example:05
```

**Expected output:**
- "Creating client with warm start enabled..."
- Timing for first session (fast - reuses warm session)
- Timing for second session (also fast)
- Summary of performance improvements

**This is the most impressive example for long-lived apps like ncode!**

---

## Troubleshooting

### "gemini: command not found"
Gemini CLI is not installed or not in PATH.
```bash
# Install gemini CLI
# Follow https://ai.google.dev/gemini-cli

# Or specify custom path
binaryPath: "/path/to/gemini"
```

### "Unauthorized" or auth errors
Gemini CLI is not authenticated.
```bash
gemini auth login
```

### "Cannot find module" errors
Install dependencies:
```bash
npm install
```

### Examples hang or timeout
Gemini CLI may be stuck. Kill the process:
```bash
pkill -f "gemini --acp"
```

Then try again.

## Creating Your Own Example

1. Create a new file `examples/06-custom.ts`
2. Copy the basic structure from `01-basic.ts`
3. Modify as needed
4. Add a script to `package.json`:
   ```json
   "example:06": "tsx examples/06-custom.ts"
   ```
5. Run it: `npm run example:06`

## All Examples at a Glance

| Example | Purpose | Lines | Features |
|---------|---------|-------|----------|
| 01-basic.ts | Simple prompt | 52 | Text prompt, streaming |
| 02-with-image.ts | Image handling | 43 | Image attachment |
| 03-permission-handling.ts | Approvals | 97 | Plan mode, permissions |
| 04-session-resume.ts | Persistence | 71 | Resume by ID |
| 05-warm-start.ts | Performance | 100 | Warm start, timing |

## Key Patterns Shown

### Creating a client
```typescript
const client = await createGeminiClient({
  binaryPath: "gemini",
  cwd: process.cwd(),
  warmStart: true,
});
```

### Opening a session
```typescript
const session = await client.openSession({
  cwd: process.cwd(),
  model: "gemini-2.0-flash",
  mode: "yolo",
});
```

### Sending a prompt
```typescript
await session.prompt([
  { type: "text", text: "Your question here" },
]);
```

### Streaming updates
```typescript
for await (const update of session.updates()) {
  if (update.sessionUpdate === "agent_message_chunk") {
    process.stdout.write(update.content?.text ?? "");
  }
}
```

### Cleanup
```typescript
await session.close();
await client.close();
```

## Performance Tips

1. **Use warm start** for applications with multiple sessions
   ```typescript
   warmStart: true
   ```

2. **Reuse client** instead of creating new ones
   ```typescript
   // Good
   const client = await createGeminiClient({...});
   const s1 = await client.openSession({...});
   const s2 = await client.openSession({...});
   
   // Bad - creates new client for each session
   ```

3. **Handle errors gracefully**
   ```typescript
   try {
     await session.prompt([...]);
   } catch (error) {
     if (error instanceof GeminiTimeoutError) {
       // Handle timeout
     }
   }
   ```

## Next Steps

After running the examples:

1. **Read the README** for complete API documentation
2. **Read WARM_START_FEATURE.md** for performance details
3. **Check src/types.ts** for all type definitions
4. **Integrate into your app** using patterns from examples

---

**All examples are syntactically valid and ready to run!** ✅
