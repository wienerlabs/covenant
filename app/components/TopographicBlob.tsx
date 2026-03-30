"use client";

import { useEffect, useRef } from "react";

interface TopographicBlobProps {
  width?: string;
  height?: string;
}

export default function TopographicBlob({
  width = "320px",
  height = "200px",
}: TopographicBlobProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dotsRef = useRef<any[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = canvas.parentElement;
    if (!container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();

    class Dot {
      x: number;
      y: number;
      radius: number;
      angle: number;
      speed: number;
      range: number;
      baseX: number;
      baseY: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.radius = Math.random() * 40 + 50;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.005 + Math.random() * 0.01;
        this.range = 30 + Math.random() * 60;
        this.baseX = this.x;
        this.baseY = this.y;
      }

      update() {
        this.angle += this.speed;
        this.x = this.baseX + Math.cos(this.angle) * this.range;
        this.y = this.baseY + Math.sin(this.angle) * this.range;
      }

      draw(c: CanvasRenderingContext2D) {
        c.fillStyle = "white";
        c.beginPath();
        c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        c.fill();
      }
    }

    dotsRef.current = [];
    for (let i = 0; i < 10; i++) {
      dotsRef.current.push(new Dot());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dotsRef.current.forEach((dot) => {
        dot.update();
        dot.draw(ctx);
      });
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: "12px",
        overflow: "hidden",
        position: "relative",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      {/* SVG filter for topographic hollow effect */}
      <svg
        style={{ position: "absolute", width: 0, height: 0 }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="topo-hollow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="20"
              result="blur"
            />
            <feComponentTransfer in="blur" result="rings">
              <feFuncA
                type="discrete"
                tableValues="0 1 0 1 0 1 0 1 0 1 0 1 0 1 0"
              />
            </feComponentTransfer>
            <feFlood floodColor="rgba(255,255,255,0.85)" result="whiteFill" />
            <feComposite in="whiteFill" in2="rings" operator="in" />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          width: "100%",
          height: "100%",
          filter: "url(#topo-hollow)",
          background: "transparent",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
