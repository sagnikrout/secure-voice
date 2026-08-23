import { describe, it, expect } from 'vitest';
import { QrCodeSignaling } from '../utils/signaling/qrCodeSignaling';

describe('QrCodeSignaling (Air-Gapped & Manual SDP Exchange)', () => {
  const sampleSdp = `v=0
o=- 38291029 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=ice-ufrag:testUfrag123
a=ice-pwd:testPassword456
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:0
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1;cbr=1
a=extmap:1 urn:ietf:params:rtp-hdrext:sdes:mid
a=msid-semantic: WMS`;

  it('compactSdp strips non-essential lines to reduce payload size', () => {
    const compacted = QrCodeSignaling.compactSdp(sampleSdp);
    expect(compacted).toContain('a=fingerprint:');
    expect(compacted).toContain('a=ice-ufrag:');
    expect(compacted).toContain('a=ice-pwd:');
    expect(compacted).toContain('a=rtpmap:');
    expect(compacted).not.toContain('a=extmap:');
    expect(compacted).not.toContain('a=msid-semantic:');
    expect(compacted.length).toBeLessThan(sampleSdp.length);
  });

  it('encodes offer to QR string and decodes correctly', () => {
    const encoded = QrCodeSignaling.encodeOffer('PEER_ALICE_123', sampleSdp, {
      fingerprint: 'AA:BB:CC:DD'
    });

    expect(typeof encoded).toBe('string');
    expect(encoded.startsWith('SV1:')).toBe(true);

    const decoded = QrCodeSignaling.decode(encoded);
    expect(decoded.v).toBe(1);
    expect(decoded.peerId).toBe('PEER_ALICE_123');
    expect(decoded.type).toBe('offer');
    expect(decoded.sdp).toContain('a=fingerprint:');
    expect(decoded.fingerprint).toBe('AA:BB:CC:DD');
  });

  it('encodes answer to QR string and decodes correctly', () => {
    const encoded = QrCodeSignaling.encodeAnswer('PEER_BOB_456', sampleSdp);
    const decoded = QrCodeSignaling.decode(encoded);

    expect(decoded.peerId).toBe('PEER_BOB_456');
    expect(decoded.type).toBe('answer');
    expect(decoded.sdp).toContain('a=ice-ufrag:');
  });

  it('throws error when decoding invalid or malformed string', () => {
    expect(() => QrCodeSignaling.decode('')).toThrow();
    expect(() => QrCodeSignaling.decode('not-a-valid-payload')).toThrow();
    expect(() => QrCodeSignaling.decode('SV1:invalid-base64-content')).toThrow();
  });
});
