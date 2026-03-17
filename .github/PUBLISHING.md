# Publishing to npm

This project is automatically published to npm on GitHub releases.

## Setup

1. **Create an npm token:**
   - Go to [npmjs.com](https://www.npmjs.com) and log in
   - Navigate to Account Settings → Tokens
   - Create a new **Granular Access Token** with:
     - Permissions: `Publish` and `Read and write`
     - Package access: Restrict to `@nsalerni/gemini-acp`
     - Expiration: As desired (e.g., 30 days)

2. **Add token to GitHub:**
   - Go to your repository Settings → Secrets and variables → Actions
   - Create a new secret: `NPM_TOKEN` with your npm token value

## Publishing

To publish a new version to npm:

1. **Update version** in `package.json`:
   ```bash
   npm version patch  # or minor, major
   ```

2. **Create a GitHub release:**
   - Go to Releases → Draft a new release
   - Tag version: `v0.1.0` (must start with `v`)
   - Release title: `v0.1.0`
   - Add release notes
   - Click "Publish release"

The GitHub Actions workflow will automatically:
- Run linting, type checking, and tests
- Build the package
- Publish to npm under `@nsalerni/gemini-acp`

## Verification

After publishing, verify the package:

```bash
npm view @nsalerni/gemini-acp

# Install and test locally
npm install @nsalerni/gemini-acp
```
