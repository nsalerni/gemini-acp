# Contributing to gemini-acp

Thanks for your interest in contributing! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Run type check: `npm run typecheck`

## Development

### Running in watch mode
```bash
npm run dev
```

### Building
```bash
npm run build
```

### Testing
```bash
npm test         # Watch mode
npm run test:run # Single run
```

## Submitting Changes

1. Create a branch for your changes
2. Make focused, atomic commits
3. Write clear commit messages
4. Submit a pull request with:
   - Description of changes
   - Motivation and context
   - Testing information
   - Any breaking changes noted

## Code Style

- Use TypeScript for all code
- Follow existing patterns in the codebase
- Ensure no unused variables or imports
- Run `npm run lint` before submitting

## Reporting Issues

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment info (Node version, Gemini CLI version, OS)
- Relevant code snippets or logs

## License

Contributions are licensed under the MIT License.
