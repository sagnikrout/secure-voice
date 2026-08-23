import React, { useEffect, useRef, memo } from 'react';
import { getAudioContext } from '../utils/audio';

/**
 * Animated real-time Web Audio level visualizer canvas with battery-saving visibility handling
 */
function AudioVisualizerComponent({ stream, isActive }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return;

    let animationFrameId;
    let throttleTimeoutId;
    let analyser;
    let sourceNode;

    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;

      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      sourceNode.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Pre-create gradient once to eliminate 60fps GC allocations
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#007aff');
      gradient.addColorStop(1, '#2ecc71');

      const render = () => {
        if (document.hidden) {
          // Throttle to 1 poll per second when hidden to conserve mobile CPU & battery
          throttleTimeoutId = setTimeout(() => {
            animationFrameId = requestAnimationFrame(render);
          }, 1000);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        ctx.fillStyle = gradient;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, canvas.height - barHeight, Math.max(barWidth - 2, 2), barHeight, 3);
          } else {
            ctx.rect(x, canvas.height - barHeight, Math.max(barWidth - 2, 2), barHeight);
          }
          ctx.fill();

          x += barWidth + 2;
        }

        animationFrameId = requestAnimationFrame(render);
      };

      render();
    } catch (err) {
      console.warn('AudioVisualizer setup error:', err);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (throttleTimeoutId) clearTimeout(throttleTimeoutId);
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch (e) {}
      }
      if (analyser) {
        try { analyser.disconnect(); } catch (e) {}
      }
    };
  }, [stream, isActive]);

  if (!stream || !isActive) return null;

  return (
    <div className="audio-visualizer-container" aria-hidden="true">
      <canvas ref={canvasRef} width={200} height={36} className="visualizer-canvas" />
    </div>
  );
}

export default memo(AudioVisualizerComponent);
