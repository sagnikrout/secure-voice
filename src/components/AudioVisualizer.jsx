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

      const render = () => {
        if (document.hidden) {
          // Skip drawing when page is hidden
          animationFrameId = requestAnimationFrame(render);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

          // Gradient color: Cyan to Blue
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#007aff');
          gradient.addColorStop(1, '#5856d6');

          ctx.fillStyle = gradient;
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
