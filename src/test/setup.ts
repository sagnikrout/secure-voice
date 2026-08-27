import '@testing-library/jest-dom';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn().mockReturnValue(true),
  writable: true,
});

// Mock Web Audio API
function createMockAudioParam(defaultValue = 0) {
  return {
    value: defaultValue,
    setValueAtTime: vi.fn().mockReturnThis(),
    setTargetAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
    cancelScheduledValues: vi.fn().mockReturnThis(),
  };
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = { connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: createMockAudioParam(440),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: createMockAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBiquadFilter() {
    return {
      type: 'highpass',
      frequency: createMockAudioParam(80),
      gain: createMockAudioParam(0),
      Q: createMockAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: createMockAudioParam(-18),
      knee: createMockAudioParam(12),
      ratio: createMockAudioParam(4),
      attack: createMockAudioParam(0.003),
      release: createMockAudioParam(0.150),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createMediaStreamDestination() {
    return {
      stream: {
        getAudioTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
        getTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0.0,
      getByteFrequencyData: vi.fn(arr => arr.fill(128)),
      getByteTimeDomainData: vi.fn(arr => arr.fill(128)),
      getFloatTimeDomainData: vi.fn(arr => arr.fill(0)),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDelay() {
    return {
      delayTime: createMockAudioParam(0.25),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

window.AudioContext = MockAudioContext;
window.webkitAudioContext = MockAudioContext;

// Mock MediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
      getTracks: () => [{ stop: vi.fn(), enabled: true }],
    }),
    enumerateDevices: vi.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default-mic', label: 'Default Microphone', groupId: 'g1' }
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

// Mock HTMLAudioElement setSinkId
if (typeof HTMLAudioElement !== 'undefined') {
  HTMLAudioElement.prototype.setSinkId = vi.fn().mockResolvedValue(undefined);
}

// Mock RTCRtpReceiver capabilities for WebRTC
if (typeof window !== 'undefined') {
  window.RTCRtpReceiver = {
    getCapabilities: vi.fn((kind) => {
      if (kind === 'audio') {
        return {
          codecs: [
            { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
            { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
            { mimeType: 'audio/telephone-event', clockRate: 8000 },
            { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 }
          ]
        };
      }
      return { codecs: [] };
    })
  };
}
