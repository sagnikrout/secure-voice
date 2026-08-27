import { describe, it, expect, beforeEach } from 'vitest';
import { E2ESignalingProtocol } from '../utils/signaling/e2eSignaling';

describe('E2ESignalingProtocol (Web Crypto ECDH + AES-256-GCM)', () => {
  let alice: E2ESignalingProtocol;
  let bob: E2ESignalingProtocol;

  beforeEach(() => {
    alice = new E2ESignalingProtocol();
    bob = new E2ESignalingProtocol();
  });

  it('generates valid P-256 ECDH keypairs and exports as JWK', async () => {
    const keyPair = await alice.generateKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();

    const jwk = await alice.exportPublicKey();
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.x).toBeDefined();
    expect(jwk.y).toBeDefined();
  });

  it('derives symmetric keys and encrypts/decrypts SDP payloads between Alice and Bob', async () => {
    const alicePubJwk = await alice.exportPublicKey();
    const bobPubJwk = await bob.exportPublicKey();

    const sampleSdp = {
      type: 'offer',
      sdp: 'v=0\r\no=alice 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
      fingerprint: 'AA:BB:CC:DD:EE:FF'
    };

    // Alice encrypts for Bob using Bob's public key
    const encrypted = await alice.encryptSignal(bobPubJwk, sampleSdp, 'AA:BB:CC:DD');

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ephemeralPublicKey).toBeDefined();
    expect(encrypted.ciphertext).not.toContain('v=0'); // Ciphertext must be encrypted

    // Bob decrypts payload from Alice
    const decrypted = await bob.decryptSignal(encrypted);

    expect(decrypted.type).toBe('offer');
    expect(decrypted.sdp).toBe(sampleSdp.sdp);
    expect(decrypted.fingerprint).toBe(sampleSdp.fingerprint);
  });

  it('generates distinct IVs and ciphertexts for identical messages', async () => {
    const bobPubJwk = await bob.exportPublicKey();
    const payload = { msg: 'identical-payload' };

    const enc1 = await alice.encryptSignal(bobPubJwk, payload);
    const enc2 = await alice.encryptSignal(bobPubJwk, payload);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('rejects tampered or corrupted ciphertext during decryption', async () => {
    const bobPubJwk = await bob.exportPublicKey();
    const payload = { secret: 'top-secret' };

    const encrypted = await alice.encryptSignal(bobPubJwk, payload);

    // Corrupt ciphertext
    const corrupted = {
      ...encrypted,
      ciphertext: btoa('corrupted-ciphertext-data-1234567890')
    };

    await expect(bob.decryptSignal(corrupted)).rejects.toThrow();
  });
  it('detects MITM tampering of the ephemeral public key', async () => {
    const bobPubJwk = await bob.exportPublicKey();
    const payload = { sdp: 'secret-sdp' };

    const encrypted = await alice.encryptSignal(bobPubJwk, payload);

    // Eve the attacker intercepts and modifies the ephemeral public key
    const eve = new E2ESignalingProtocol();
    const evePubJwk = await eve.exportPublicKey();
    const tampered = {
      ...encrypted,
      ephemeralPublicKey: evePubJwk
    };

    // Bob attempts to decrypt the tampered payload. The ciphertext was encrypted with Alice's key,
    // but the payload claims it's from Eve. The derived shared key will not match, causing GCM auth failure.
    await expect(bob.decryptSignal(tampered)).rejects.toThrow();
  });
});
