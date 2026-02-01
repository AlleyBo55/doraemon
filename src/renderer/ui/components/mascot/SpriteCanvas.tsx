import type { FunctionalComponent } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { SPRITE } from '../../../core/constants/sprite';

type SpriteCanvasProps = {
  imageSrc: string;
  width?: number;
  height?: number;
  className?: string;
};

export const SpriteCanvas: FunctionalComponent<SpriteCanvasProps> = ({
  imageSrc,
  width = SPRITE.WIDTH,
  height = SPRITE.HEIGHT,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = imageSrc;

    return () => {
      imageRef.current = null;
    };
  }, [imageSrc, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      class={`pointer-events-none ${className}`}
    />
  );
};
