import React, { useEffect, useRef } from 'react';
import { AudioVisualizerProps } from '../types';

export const Visualizer: React.FC<AudioVisualizerProps> = ({ isActive, volume }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let currentRadius = 50;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!isActive) {
        // Static state
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 40, 0, 2 * Math.PI);
        ctx.fillStyle = '#cbd5e1'; // slate-300
        ctx.fill();
      } else {
        // Dynamic pulsing
        const targetRadius = 50 + (volume * 100); // Scale based on volume
        // Smooth transition
        currentRadius += (targetRadius - currentRadius) * 0.2;

        // Outer Glow
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, currentRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // blue-500 with opacity
        ctx.fill();

        // Inner Core
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (volume * 10), 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6'; // blue-500
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, volume]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={300} 
      className="w-full max-w-[300px] h-auto mx-auto"
    />
  );
};