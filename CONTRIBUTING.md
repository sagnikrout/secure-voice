# Contributing to SecureVoice

Thank you for considering contributing to SecureVoice! This document provides guidelines and instructions for contributing to the project.

---

## 🎯 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Report security issues privately (don't open public issues)
- Respect privacy and security implications of changes

---

## 🐛 Reporting Issues

### Security Vulnerabilities
**Do NOT** open a public GitHub issue for security vulnerabilities. Instead:
1. Email the maintainers with vulnerability details
2. Allow time for a patch before public disclosure
3. Include reproduction steps and impact assessment

### Bugs & Feature Requests
1. Check existing issues to avoid duplicates
2. Use clear, descriptive titles
3. Include:
   - Environment (browser, OS, network conditions)
   - Reproduction steps
   - Expected vs. actual behavior
   - Screenshots/logs if applicable
4. Label appropriately (`bug`, `enhancement`, `documentation`, etc.)

---

## 🔧 Development Setup

```bash
# Clone repository
git clone https://github.com/sagnikrout/secure-voice.git
cd secure-voice

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run end-to-end simulation
npm run test:sim

# Run network impairment tests
npm run test:network
```

---

## 📝 Making Changes

### Branch Naming
- `feature/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation updates
- `refactor/description` — Code improvements
- `test/description` — Test additions

### Commit Guidelines
- Use clear, present-tense commit messages
- Reference issues where applicable: `fix: audio routing issue #42`
- Keep commits atomic (one logical change per commit)
- Sign commits with `-s` flag for DCO: `git commit -s`

**Good commit:**
```
feat: add voice activity detection for silence suppression

- Implement WebAudio analyser for real-time voice detection
- Auto-pause Opus stream when silence detected
- Improves battery efficiency on Android. Fixes #123
```

**Bad commit:**
```
fixes stuff and does audio things
```

### Code Style

**JavaScript/React:**
```javascript
// Use const/let (never var)
const value = 'something';

// Use arrow functions where appropriate
const callback = () => { /* ... */ };

// Use destructuring
const { prop1, prop2 } = obj;

// Meaningful variable names
const userMicrophoneDeviceId = 'device-123';  // ✅ Good
const mic = 'device-123';                     // ❌ Unclear

// JSDoc comments for public functions
/**
 * Generates deterministic 5-digit safety code from DTLS fingerprints
 * @param {string} localSdp
 * @param {string} remoteSdp
 * @returns {Promise<string|null>}
 */
export async function generateSafetyCode(localSdp, remoteSdp) { /* ... */ }

// Handle errors explicitly
try {
  await mediaDevices.getUserMedia(constraints);
} catch (err) {
  console.warn(`Microphone access denied: ${err.message}`);
  // Provide fallback or user feedback
}
```

**CSS/Styling:**
- Use CSS custom properties for theming
- Follow BEM naming convention for complex components
- Mobile-first approach for responsive design
- High contrast for accessibility

---

## ✅ Testing Requirements

All contributions must include tests:

### Unit Tests (Vitest)
```bash
npm test
```

Add tests to `src/test/` for:
- Utility functions (audio.js, webrtc.js, formatters.js)
- Component interactions
- Error handling

**Test Example:**
```javascript
import { describe, it, expect } from 'vitest';
import { transformOpusSdp } from '../utils/webrtc';

describe('transformOpusSdp', () => {
  it('should enforce 12kbps bitrate in SDP', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 ...\r\n';
    const result = transformOpusSdp(sdp);
    expect(result).toContain('maxaveragebitrate=12000');
  });

  it('should handle missing Opus payload type gracefully', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 0\r\n';
    expect(() => transformOpusSdp(sdp)).not.toThrow();
  });
});
```

### End-to-End Tests
```bash
npm run test:sim
```

For major features, add to `scripts/webrtc-simulation-runner.js`:
- Test two-peer handshakes
- Verify audio exchange
- Test call termination

### Manual Testing
- Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- Test on mobile (iOS Safari, Android Chrome)
- Test on low-bandwidth networks (dev tools throttling)
- Test audio device switching
- Test incoming call rejection when busy

---

## 🎨 Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/add-video-calling
   ```

2. **Make Changes**
   - Follow code style guidelines
   - Add tests for new functionality
   - Update documentation as needed
   - Keep commits clean and atomic

3. **Run Tests Locally**
   ```bash
   npm test
   npm run test:sim
   npm run build
   ```

4. **Push to Fork**
   ```bash
   git push origin feature/add-video-calling
   ```

5. **Create Pull Request**
   - Use descriptive title and description
   - Reference related issues: `Closes #123`
   - Include before/after screenshots for UI changes
   - List testing performed
   - Note any breaking changes

6. **Address Review Feedback**
   - Respond to comments
   - Make requested changes
   - Re-request review once ready

---

## 📚 Documentation Changes

### README.md
- Keep up-to-date with major features
- Add quick-start examples
- Document new configuration options

### RELEASE_NOTES.md
- Add entries for version releases
- Document features, fixes, improvements
- Include test verification results

### Code Comments
- Add JSDoc for public functions/exports
- Explain complex algorithms (e.g., SDP transformation)
- Link to WebRTC/Opus specs where relevant

**Example:**
```javascript
/**
 * Transform SDP to enforce Opus low-bandwidth audio:
 * - maxaveragebitrate = 12kbps (mono voice)
 * - usedtx = 1 (silence suppression)
 * - useinbandfec = 1 (forward error correction for packet loss)
 * 
 * @see https://tools.ietf.org/html/rfc7587#section-6 (Opus RTP Payload Format)
 * @param {string} sdp - Raw SDP offer/answer
 * @returns {string} Munged SDP
 */
export function transformOpusSdp(sdp) {
  // Implementation...
}
```

---

## 🚀 Areas for Contribution

### High Priority
- **Better error recovery** — Network reconnection, call recovery
- **Performance optimization** — Reduce bundle size, faster startup
- **Accessibility** — Screen reader support, keyboard navigation
- **Internationalization** — Multi-language support

### Medium Priority
- **Enhanced diagnostics** — More detailed network stats, bandwidth graphs
- **Advanced audio** — Echo cancellation tuning, background noise detection
- **UI improvements** — Custom themes, better call history
- **Android features** — Notification improvements, lock-screen calling

### Low Priority (Ideas)
- Video calling support
- Message encryption
- Call recording
- Advanced network routing
- Cloud signaling server (self-hosted)

---

## 🔐 Security Considerations

**When contributing security-related code:**
- Never log sensitive data (crypto keys, fingerprints, full Peer IDs)
- Validate all user input before use
- Use constant-time comparison for cryptographic values
- Avoid timing attacks in authentication code
- Document security implications in code comments
- Test with browser security sandboxing enabled

**Cryptographic best practices:**
```javascript
// ✅ Good: Use crypto.getRandomValues with proper rejection sampling
export function generatePeerId(length = 9) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // ... transform to alphabet safely
}

// ❌ Bad: Math.random() is not cryptographically secure
const randomId = Math.random().toString(36);
```

---

## 📦 Release Process

Maintainers use this process for releases:

1. Update version in `package.json`
2. Update `RELEASE_NOTES.md` with features/fixes
3. Create git tag: `git tag v3.0.1`
4. Push tag: `git push origin v3.0.1`
5. GitHub Actions automatically:
   - Runs full test suite
   - Builds production bundle
   - Deploys to GitHub Pages
6. Build Android APK and attach to release
7. Update live documentation

---

## 💡 Tips for Success

1. **Start small** — Fix a typo in docs first, then tackle a bug, then propose features
2. **Communicate** — Open an issue to discuss before major changes
3. **Test thoroughly** — Run all test suites and test manually
4. **Read existing code** — Learn patterns used in codebase
5. **Check CI/CD** — Ensure GitHub Actions passes before requesting review
6. **Be patient** — Maintainers review in free time; be respectful of delays
7. **Ask questions** — Don't hesitate to ask for clarification in PR discussions

---

## 🎓 Learning Resources

- **WebRTC Basics:** https://webrtc.org/getting-started/overview
- **Opus Codec:** https://tools.ietf.org/html/rfc7587
- **PeerJS Docs:** https://peerjs.com/docs.html
- **Web Audio API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **React Hooks:** https://react.dev/reference/react/hooks
- **Vitest Documentation:** https://vitest.dev/guide/

---

## ❓ Questions?

- 💬 Comment on relevant GitHub issues
- 📧 Reach out via GitHub discussions
- 🐛 Check existing issues for answers

Thank you for contributing to SecureVoice! 🙏
