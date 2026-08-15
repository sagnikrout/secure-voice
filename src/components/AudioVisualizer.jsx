import React, { useEffect, useRef } from 'react';

/**
 * Animated real-time Web Audio level visualizer canvas / bars
 */
export default function AudioVisualizer({ stream, isActive }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return;

    let animationFrameId;
    let audioCtx;
    let analyser;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const render = () => {
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
          ctx.roundRect(x, canvas.height - barHeight, Math.max(barWidth - 2, 2), barHeight, 3);
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
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream, isActive]);

  if (!stream || !isActive) return null;

  return (
    <div className="audio-visualizer-container">
      <canvas ref={canvasRef} width={200} height={36} className="visualizer-canvas" />
    </div>
  );
}
