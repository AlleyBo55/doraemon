import type { FunctionalComponent, JSX } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { PHYSICS } from '../../../core/constants/sprite';

type Position = { x: number; y: number };
type Velocity = { x: number; y: number };

type MascotContainerProps = {
  children: JSX.Element;
  initialPosition?: Position;
  onPositionChange?: (pos: Position) => void;
};

export const MascotContainer: FunctionalComponent<MascotContainerProps> = ({
  children,
  initialPosition = { x: 100, y: 100 },
  onPositionChange,
}) => {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const velocityRef = useRef<Velocity>({ x: 0, y: 0 });
  const lastPosRef = useRef<Position>(initialPosition);
  const rafRef = useRef<number | null>(null);

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;

      velocityRef.current = { x: dx, y: dy };
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      setPosition((prev) => {
        const next = { x: prev.x + dx, y: prev.y + dy };
        onPositionChange?.(next);
        return next;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      applyPhysics();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onPositionChange]);

  const applyPhysics = () => {
    const animate = () => {
      const vel = velocityRef.current;
      const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2);

      if (speed < 0.5) {
        velocityRef.current = { x: 0, y: 0 };
        return;
      }

      velocityRef.current = {
        x: vel.x * PHYSICS.DRAG_DAMPING,
        y: vel.y * PHYSICS.DRAG_DAMPING + PHYSICS.GRAVITY,
      };

      setPosition((prev) => {
        const next = {
          x: prev.x + velocityRef.current.x,
          y: Math.min(prev.y + velocityRef.current.y, window.innerHeight - 128),
        };
        onPositionChange?.(next);
        return next;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      class={`
        fixed select-none
        transition-transform duration-75
        ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}
      `}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
};
