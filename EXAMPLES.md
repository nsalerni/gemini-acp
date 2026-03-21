# Examples

Run any example with npm scripts or tsx directly:

```bash
npm run example:01    # or: npx tsx examples/01-basic.ts
```

## Prerequisites

- Node.js 18+
- [Gemini CLI](https://ai.google.dev/gemini-cli) v0.30+ installed and authenticated (`gemini auth login`)

## Overview

| Example | What it shows |
|---------|---------------|
| `01-basic.ts` | Send a prompt, stream the response |
| `02-with-image.ts` | Attach an image to a prompt |
| `03-permission-handling.ts` | Plan mode with tool approval callbacks |
| `04-session-resume.ts` | Save a session ID and resume later |
| `05-warm-start.ts` | Background session for faster first prompt |
| `bench-warm-start.ts` | Microbenchmark: warm vs cold start |

## Key Patterns

### Send a prompt and stream updates (recommended)

```typescript
for await (const update of session.send("Your prompt here")) {
  if (update.sessionUpdate === "agent_message_chunk") {
    process.stdout.write(update.content?.text ?? "");
  }
}
```

### Send with images

```typescript
import { imageFileToContentBlock } from "@nsalerni/gemini-acp/helpers";

const image = await imageFileToContentBlock("screenshot.png");
for await (const update of session.send([
  { type: "text", text: "Describe this" },
  image,
])) { ... }
```

### Low-level: prompt + updates separately

```typescript
await session.prompt("Your prompt here");
for await (const update of session.updates()) { ... }
```

## Troubleshooting

- **`gemini: command not found`** — Install the [Gemini CLI](https://ai.google.dev/gemini-cli) or pass `binaryPath` to `createGeminiClient()`
- **Auth errors** — Run `gemini auth login`
- **Hangs** — Kill stuck processes with `pkill -f "gemini --acp"`
