# Quick Start for Developers

## What You Have

A complete, standalone Node.js library for communicating with Gemini CLI over ACP protocol.

**Location:** `/Users/nilptr/dev/open-source/gemini-acp/`

## File Structure at a Glance

```
src/
  ├── index.ts                      # Main export (start here)
  ├── types.ts                      # All type definitions
  ├── errors.ts                     # Error classes
  ├── constants.ts                  # ACP protocol constants
  ├── utils.ts                      # Utility functions
  ├── client.ts                     # GeminiClientImpl (public API)
  ├── JsonRpcStdioClient.ts         # Low-level JSON-RPC transport
  ├── GeminiAcpBroker.ts           # Session multiplexing
  ├── GeminiSessionImpl.ts          # High-level session
  └── helpers/                      # Optional utilities

examples/                           # 4 runnable examples
  ├── 01-basic.ts
  ├── 02-with-image.ts
  ├── 03-permission-handling.ts
  └── 04-session-resume.ts

docs/
  ├── README.md                     # ← Start with this for users
  ├── ARCHITECTURE.md               # ← Start with this for developers
  ├── EXTRACTION_SUMMARY.md         # ← Why it was extracted
  ├── PROJECT_STATUS.md             # ← Release readiness
  └── CONTRIBUTING.md               # ← For contributors
```

## Key Files to Know

### Public API Entry Point
- **`src/client.ts`**: The `createGeminiClient()` factory function

### Core Protocol Logic
- **`src/JsonRpcStdioClient.ts`**: JSON-RPC over stdio (process spawning, request correlation, timeouts)
- **`src/GeminiAcpBroker.ts`**: Session multiplexing and routing

### Type Definitions
- **`src/types.ts`**: All public and internal types (well-commented)

### Error Handling
- **`src/errors.ts`**: 7 error classes, hierarchy is clear

## How to Understand the Code

### New to the Codebase?
1. Read `ARCHITECTURE.md` (5 min read) - understand system design
2. Look at `examples/01-basic.ts` (10 min) - see how it's used
3. Read `src/index.ts` (1 min) - see public exports
4. Skim `src/types.ts` (5 min) - understand data shapes

### Making Changes?
1. Understand the component: read its docstring
2. Check `types.ts` for any types you need
3. Add tests (see PROJECT_STATUS.md for testing approach)
4. Run `npm run typecheck` to verify types
5. Run `npm run build` to compile

### Understanding the Flow?
1. `src/client.ts` → entry point
2. `src/GeminiAcpBroker.ts` → session management
3. `src/JsonRpcStdioClient.ts` → low-level transport
4. See ARCHITECTURE.md for data flow diagrams

## Development Commands

```bash
# Build
npm run build

# Type check (fast)
npm run typecheck

# Lint
npm run lint

# Watch mode
npm run dev
```

## Code Organization Principles

1. **Layers**:
   - `JsonRpcStdioClient` (transport) - lowest level
   - `GeminiAcpBroker` (multiplexing) - middle level
   - `GeminiSessionImpl` + `GeminiClientImpl` (API) - highest level

2. **Exports**:
   - `src/index.ts` is the only public export
   - Everything else is `export` within src/ directory

3. **Types**:
   - `src/types.ts` defines everything public-facing
   - Internal interfaces are defined in their modules (e.g., `JsonRpcRequestMessage`)

4. **Errors**:
   - All custom errors in `src/errors.ts`
   - Follow pattern: throw new GeminiXxxError(message, cause, metadata)

## Common Tasks

### Add a New Method to Sessions
1. Add type to `types.ts` (e.g., `GeminiSessionUpdate`)
2. Implement in `GeminiSessionImpl.ts`
3. Update `README.md` with example

### Add a New Error Type
1. Create class in `src/errors.ts`
2. Export in `src/index.ts`
3. Use in appropriate module

### Change ACP Protocol Constants
1. Edit `src/constants.ts`
2. Update uses across codebase (TypeScript will catch it)

### Add a Helper Function
1. Create in `src/helpers/yourFile.ts`
2. Export in `src/helpers/index.ts`
3. Re-export in `src/index.ts` if public

## What's NOT Included (By Design)

❌ No ncode-specific types (ProviderSession, ThreadId, etc.)
❌ No Effect/Layer framework integration
❌ No event emission system (use async iterables instead)
❌ No session persistence (you handle serialization)
❌ No process pooling (one process per config)

These can be added as wrappers or in v0.2+ if needed.

## Testing Approach (When You Add Tests)

See `PROJECT_STATUS.md` for detailed test strategy, but basically:

1. **Unit Tests**: JSON-RPC parsing, request correlation, timeouts
2. **Contract Tests**: Fake ACP server (in-process)
3. **Integration Tests**: Real Gemini CLI (behind env flag)

## Before You Commit

```bash
npm run typecheck  # Must pass
npm run build      # Must pass
npm run lint       # Must pass (if you added tests)
```

## Documentation to Update When You Change Code

- `README.md` if API changes
- `ARCHITECTURE.md` if design changes
- Code comments in the file you modified
- Examples in `examples/` if new use case

## Getting Help

- **Architecture questions**: Read `ARCHITECTURE.md`
- **API questions**: Read `README.md` and `src/types.ts`
- **Type errors**: Check `src/types.ts`
- **Protocol questions**: Check `src/constants.ts` and comments

## Next Steps

1. **For v0.1 Release**: No changes needed, ready to publish
2. **For v0.2 Development**: Start with `PROJECT_STATUS.md` "Recommended for Next Phase"
3. **For Integration in ncode**: Import this package, remove internal adapter

---

Happy developing! 🚀
