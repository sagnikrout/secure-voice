# Contributing to SecureVoice

Guidelines and instructions for contributing to SecureVoice.

## Code of conduct

- Treat others with respect.
- Report security issues privately.
- Keep commits focused on a single change.

## Reporting issues

### Security vulnerabilities
Do not open a public issue for security problems. Email the maintainers directly with reproduction steps and impact details.

### Bugs and feature requests
1. Search existing issues before opening a new one.
2. Use a short, descriptive title.
3. Include:
   - Environment (browser, OS, network type)
   - Steps to reproduce
   - Expected behavior versus what actually happened
   - Relevant browser console logs

## Development setup

```bash
# Clone the repository
git clone https://github.com/sagnikrout/secure-voice.git
cd secure-voice

# Install dependencies
npm install

# Start development server
npm run dev

# Run unit tests
npm test

# Run resilience benchmarks
npm run benchmark

# Compile TypeScript and build web bundle
npm run build
```

## Making changes

### Branch naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions

### Commit guidelines
- Use present tense: `fix: handle audio context suspension on tab switch`
- Reference issues where relevant: `fix: audio routing issue (#42)`
- Keep each commit focused on one logical change.

### Code style

```typescript
// Use const/let, not var
const value = 'something';

// Explicit TypeScript types on public utilities
export async function generateSafetyCode(localSdp: string, remoteSdp: string): Promise<string | null> {
  // ...
}

// Explicit error handling
try {
  await mediaDevices.getUserMedia(constraints);
} catch (err) {
  console.warn(`Microphone access denied: ${(err as Error).message}`);
}
```

## Testing requirements

All pull requests must pass existing tests and include tests for new functionality:

```bash
npm test
npm run benchmark
npm run build
```

## Pull request checklist

1. Run `npm test` and `npm run build` locally.
2. Keep the diff minimal and focused.
3. Update `CHANGELOG.md` if adding or changing user-facing features.
4. Include screenshots or terminal logs for UI and benchmark changes.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
