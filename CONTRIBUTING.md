# Contributing to gemini-acp

Welcome! We appreciate your interest in improving `gemini-acp`. Whether it's a bug fix, new feature, or documentation update, contributions of all kinds are valued.

## Prerequisites

- **Node.js 18+** (see `engines` in `package.json`)
- **Gemini CLI** — only needed for integration testing against a live CLI instance (optional for most contributions)

## Development Setup

```bash
git clone https://github.com/nsalerni/gemini-acp.git
cd gemini-acp
npm install
npm run check    # typecheck + lint + tests — verify everything passes
```

## Project Structure

| Path | Purpose |
|------|---------|
| `src/client.ts` | Public `createGeminiSession()` entry point |
| `src/GeminiAcpBroker.ts` | Top-level broker that manages session lifecycle |
| `src/GeminiSessionImpl.ts` | Session implementation (send/stream messages) |
| `src/JsonRpcStdioClient.ts` | Low-level JSON-RPC transport over stdio |
| `src/types.ts` | Shared TypeScript interfaces and type definitions |
| `src/constants.ts` | ACP method names and protocol constants |
| `src/errors.ts` | Typed error classes for all failure modes |
| `src/preflight.ts` | Pre-session validation (CLI availability, version checks) |
| `src/utils.ts` | Internal utility functions |
| `src/helpers/` | Optional higher-level helpers built on the core API |
| `src/__tests__/` | Unit and integration tests (Vitest) |
| `src/__benchmarks__/` | Performance benchmarks |

## Development Workflow

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint with ESLint (zero warnings allowed) |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Single test run (CI-friendly) |
| `npm run check` | **Full quality gate** — typecheck + lint + tests |
| `npm run clean` | Remove `dist/` build artifacts |

Run `npm run check` before pushing — it's the same gate CI runs.

## Code Conventions

- **Strict TypeScript** — no `any`. Use `unknown` and narrow with type guards.
- **JSDoc on all public APIs** — include `@param`, `@returns`, and `@throws` tags.
- **`@internal`** — mark internal APIs so they are excluded from public documentation.
- **Use constants** — import ACP method names from `constants.ts`. Never use string literals for protocol methods.
- **Typed errors** — throw error classes from `errors.ts`. Never throw plain strings or untyped `Error`.
- **Async iterables for streaming** — no callbacks or event emitters. Consumers should use `for await...of`.

## Testing

Tests live in `src/__tests__/` alongside a **fake ACP server** that simulates Gemini CLI responses over stdio. This lets you test the full request/response cycle without a real CLI.

When writing tests:

1. Place test files in `src/__tests__/` with a `.test.ts` extension.
2. Use the fake server helpers to set up controlled request/response scenarios.
3. Test both success paths and error paths (timeouts, malformed responses, etc.).
4. Run `npm run test:run` to verify before submitting.

## Pull Request Process

1. **Branch naming** — use `feat/description`, `fix/description`, or `docs/description`.
2. **Commit messages** — follow [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add warm-start session support
   fix: handle unexpected EOF during streaming
   docs: update API usage examples
   ```
3. **PR description** — include:
   - What changed and why
   - How to test the change
   - Any breaking changes (with migration notes)
4. **Ensure `npm run check` passes** before requesting review.

## Reporting Issues

When filing a bug report, please include:

- A clear description of the problem
- Minimal steps to reproduce
- Expected vs. actual behavior
- Environment details: Node.js version, OS, Gemini CLI version (if applicable)
- Relevant error messages or logs

## License

This project is licensed under the [MIT License](LICENSE). By contributing, you agree that your contributions will be licensed under the same terms.
