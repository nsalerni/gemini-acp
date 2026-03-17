# Publishing to npm

This project is automatically published to npm on GitHub releases using OIDC (OpenID Connect) for secure, token-free authentication.

## Setup

**No manual token setup needed!** GitHub Actions automatically authenticates with npm via OIDC.

The only requirement is that your npm account has **two-factor authentication enabled** and **token-based authentication disabled** (which you've already configured).

## Publishing

Publishing is **fully automated**. Just push commits to `main`:

1. **Push commits to main:**
   ```bash
   git push origin main
   ```

2. **That's it!** The CI/CD pipeline will:
   - Run tests, linting, and type checking
   - Auto-bump the patch version
   - Create a git tag and GitHub release
   - Publish to npm automatically

### How it works

- On every push to `main`, after tests pass, the `release` job automatically bumps the patch version using `npm version patch`
- It creates a commit and git tag (e.g., `v0.1.5`)
- The version update is pushed back to `main`
- A GitHub Release is created from the tag
- The `publish.yml` workflow detects the release and publishes to npm

### Manual publishing (advanced)

If you need to skip auto-publishing for a specific commit, add `[skip-release]` to your commit message:
```bash
git commit -m "docs: update README [skip-release]"
```

Note: This feature requires adding a conditional to the `release` job. Let us know if you need it.

## Verification

After publishing, verify the package:

```bash
npm view @nsalerni/gemini-acp

# Install and test locally
npm install @nsalerni/gemini-acp
```
