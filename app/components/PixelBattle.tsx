"use client";

import { useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WarriorState = "idle" | "taunt" | "attack" | "hit" | "victory" | "defeat";

interface PixelBattleProps {
  alphaState: WarriorState;
  omegaState: WarriorState;
  alphaHP: number;
  omegaHP: number;
  width?: number;
  height?: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PIXEL_SIZE = 3;
const ALPHA_COLOR = "#42BDFF";
const OMEGA_COLOR = "#FF425E";
const GOLD_COLOR = "#FFE342";
const SILVER_COLOR = "#C0C0C0";

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function lighten(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = pct / 100;
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

function darken(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - pct / 100;
  return rgbToHex(r * f, g * f, b * f);
}

function desaturate(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = pct / 100;
  return rgbToHex(r + (gray - r) * f, g + (gray - g) * f, b + (gray - b) * f);
}

/* ------------------------------------------------------------------ */
/*  Particle system                                                    */
/* ------------------------------------------------------------------ */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: "spark" | "star" | "dust";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PixelBattle({
  alphaState,
  omegaState,
  alphaHP,
  omegaHP,
  width = 600,
  height = 200,
}: PixelBattleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  // Track previous states to detect transitions
  const prevAlphaRef = useRef<WarriorState>("idle");
  const prevOmegaRef = useRef<WarriorState>("idle");

  // Animation progress for each state (0-1)
  const alphaAnimRef = useRef({ progress: 0, startFrame: 0 });
  const omegaAnimRef = useRef({ progress: 0, startFrame: 0 });

  // HP animation
  const alphaHPAnimRef = useRef(100);
  const omegaHPAnimRef = useRef(100);

  const spawnParticles = useCallback(
    (
      x: number,
      y: number,
      count: number,
      type: "spark" | "star" | "dust",
      baseColor: string,
    ) => {
      const colors = [GOLD_COLOR, "#ffffff", baseColor];
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = type === "star" ? 0.5 + Math.random() * 1.5 : 1.5 + Math.random() * 3;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy:
            type === "star"
              ? -(1 + Math.random() * 2)
              : Math.sin(angle) * speed - 1,
          life: type === "dust" ? 20 + Math.random() * 15 : 30 + Math.random() * 20,
          maxLife: type === "dust" ? 35 : 50,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: type === "star" ? 3 : 2,
          type,
        });
      }
    },
    [],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const frame = frameRef.current;
      const p = PIXEL_SIZE;

      // Warrior base positions
      const groundY = height - 10;
      const alphaBaseX = width * 0.18;
      const omegaBaseX = width * 0.82;
      const warriorBaseY = groundY - 20 * p;

      /* ---- Detect state transitions and spawn particles ---- */
      if (alphaState !== prevAlphaRef.current) {
        alphaAnimRef.current = { progress: 0, startFrame: frame };
        if (alphaState === "attack") {
          // Spawn sparks at collision point
          setTimeout(() => {
            spawnParticles(
              alphaBaseX + 35 * p,
              warriorBaseY + 6 * p,
              8,
              "spark",
              ALPHA_COLOR,
            );
          }, 200);
        }
        if (alphaState === "victory") {
          spawnParticles(
            alphaBaseX + 8 * p,
            warriorBaseY - 5 * p,
            12,
            "star",
            ALPHA_COLOR,
          );
        }
        if (alphaState === "defeat") {
          spawnParticles(
            alphaBaseX + 8 * p,
            warriorBaseY + 16 * p,
            6,
            "dust",
            ALPHA_COLOR,
          );
        }
        prevAlphaRef.current = alphaState;
      }

      if (omegaState !== prevOmegaRef.current) {
        omegaAnimRef.current = { progress: 0, startFrame: frame };
        if (omegaState === "attack") {
          setTimeout(() => {
            spawnParticles(
              omegaBaseX - 35 * p,
              warriorBaseY + 6 * p,
              8,
              "spark",
              OMEGA_COLOR,
            );
          }, 200);
        }
        if (omegaState === "victory") {
          spawnParticles(
            omegaBaseX - 8 * p,
            warriorBaseY - 5 * p,
            12,
            "star",
            OMEGA_COLOR,
          );
        }
        if (omegaState === "defeat") {
          spawnParticles(
            omegaBaseX - 8 * p,
            warriorBaseY + 16 * p,
            6,
            "dust",
            OMEGA_COLOR,
          );
        }
        prevOmegaRef.current = omegaState;
      }

      /* ---- Update animation progress ---- */
      const elapsed = (f: number) => frame - f;
      const alphaE = elapsed(alphaAnimRef.current.startFrame);
      const omegaE = elapsed(omegaAnimRef.current.startFrame);
      alphaAnimRef.current.progress = Math.min(1, alphaE / 30);
      omegaAnimRef.current.progress = Math.min(1, omegaE / 30);

      /* ---- Animate HP bars smoothly ---- */
      alphaHPAnimRef.current += (alphaHP - alphaHPAnimRef.current) * 0.05;
      omegaHPAnimRef.current += (omegaHP - omegaHPAnimRef.current) * 0.05;

      /* ---- Clear canvas ---- */
      ctx.clearRect(0, 0, width, height);

      /* ---- Draw ground ---- */
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, groundY, width, 10);
      // Ground variation patches
      for (let gx = 0; gx < width; gx += 8) {
        if ((gx * 7 + 13) % 5 === 0) {
          ctx.fillStyle = "#14142a";
          ctx.fillRect(gx, groundY + 2, 6, 3);
        }
        if ((gx * 3 + 7) % 4 === 0) {
          ctx.fillStyle = "#222244";
          ctx.fillRect(gx, groundY + 5, 4, 2);
        }
        if ((gx * 11 + 3) % 7 === 0) {
          ctx.fillStyle = "#181836";
          ctx.fillRect(gx, groundY, 3, 2);
        }
      }

      /* ---- Draw HP Bars ---- */
      const hpBarWidth = 120;
      const hpBarHeight = 8;
      const hpBarY = 10;

      // Alpha HP bar (left side)
      const alphaHPx = 30;
      drawHPBar(
        ctx,
        alphaHPx,
        hpBarY,
        hpBarWidth,
        hpBarHeight,
        alphaHPAnimRef.current,
        ALPHA_COLOR,
        p,
      );

      // Omega HP bar (right side)
      const omegaHPx = width - 30 - hpBarWidth;
      drawHPBar(
        ctx,
        omegaHPx,
        hpBarY,
        hpBarWidth,
        hpBarHeight,
        omegaHPAnimRef.current,
        OMEGA_COLOR,
        p,
      );

      /* ---- Draw Warriors ---- */
      drawWarrior(
        ctx,
        alphaBaseX,
        warriorBaseY,
        ALPHA_COLOR,
        "right",
        alphaState,
        frame,
        alphaAnimRef.current,
        p,
      );

      drawWarrior(
        ctx,
        omegaBaseX,
        warriorBaseY,
        OMEGA_COLOR,
        "left",
        omegaState,
        frame,
        omegaAnimRef.current,
        p,
      );

      /* ---- Update and draw particles ---- */
      const aliveParticles: Particle[] = [];
      for (const pt of particlesRef.current) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        if (pt.type !== "star") {
          pt.vy += 0.3;
        } else {
          pt.vy += 0.05;
        }
        pt.life--;

        if (pt.life > 0) {
          const alpha = Math.max(0, pt.life / pt.maxLife);
          const [pr, pg, pb] = hexToRgb(pt.color);
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;

          if (pt.type === "star") {
            // Cross-shaped star
            const s = pt.size;
            ctx.fillRect(pt.x - s, pt.y, s * 2 + 1, 1);
            ctx.fillRect(pt.x, pt.y - s, 1, s * 2 + 1);
          } else {
            ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
          }
          aliveParticles.push(pt);
        }
      }
      particlesRef.current = aliveParticles;
    },
    [alphaState, omegaState, alphaHP, omegaHP, width, height, spawnParticles],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;

    function animate() {
      frameRef.current++;
      draw(ctx!);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "transparent",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          display: "block",
          width: `${width}px`,
          height: `${height}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

/* ================================================================== */
/*  Drawing Functions                                                  */
/* ================================================================== */

function drawHPBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  color: string,
  p: number,
) {
  // Pixel heart icon (3x3 pattern)
  const heartX = x - 12;
  const heartY = y;
  const [hr, hg, hb] = hexToRgb(color);
  ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
  // Row 0: _X_X_
  ctx.fillRect(heartX + 1, heartY, 2, 1);
  ctx.fillRect(heartX + 4, heartY, 2, 1);
  // Row 1: XXXXX
  ctx.fillRect(heartX, heartY + 1, 7, 2);
  // Row 2: _XXX_
  ctx.fillRect(heartX + 1, heartY + 3, 5, 1);
  // Row 3: __X__
  ctx.fillRect(heartX + 2, heartY + 4, 3, 1);
  // Row 4: tip
  ctx.fillRect(heartX + 3, heartY + 5, 1, 1);

  // Bar background
  ctx.fillStyle = "#2a2a3e";
  ctx.fillRect(x, y, w, h);

  // Bar fill
  const fillW = Math.max(0, (hp / 100) * (w - 2));
  const fillColor = hp > 50 ? color : hp > 25 ? GOLD_COLOR : "#FF2222";
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 1, y + 1, fillW, h - 2);

  // White border outline
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

  // HP text via small pixel numbers -- skip for clean look, just HP bar suffices
  void p;
}

interface AnimState {
  progress: number;
  startFrame: number;
}

function drawWarrior(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  color: string,
  facing: "left" | "right",
  state: WarriorState,
  frame: number,
  animState: AnimState,
  p: number,
) {
  const light = lighten(color, 30);
  const dark = darken(color, 30);
  const darkest = darken(color, 50);

  // Mirroring: if facing left, we flip the x coordinates
  const dir = facing === "right" ? 1 : -1;

  /* ---- Compute offsets based on state ---- */
  let offsetX = 0;
  let offsetY = 0;
  let swordAngle = 0; // 0 = normal, 1 = raised, 2 = forward swing
  let isFlashing = false;
  let isDesaturated = false;
  let fallAngle = 0;
  let glowAlpha = 0;

  const elapsed = frame - animState.startFrame;

  switch (state) {
    case "idle": {
      // Gentle bounce
      offsetY = Math.sin(frame * 0.06) * p;
      swordAngle = 0;
      break;
    }
    case "taunt": {
      // Lean forward, raise sword
      const t = Math.min(1, elapsed / 15);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      offsetX = dir * 3 * p * (ease < 0.5 ? ease * 2 : 2 - ease * 2);
      swordAngle = 1;
      // Return to idle handled by state change from parent
      break;
    }
    case "attack": {
      // Dash forward, swing sword
      const t = Math.min(1, elapsed / 25);
      let dashT: number;
      if (t < 0.4) {
        // Dash forward
        dashT = t / 0.4;
        offsetX = dir * 30 * p * (dashT * dashT);
      } else if (t < 0.6) {
        // Hold at peak
        offsetX = dir * 30 * p;
      } else {
        // Return
        const retT = (t - 0.6) / 0.4;
        offsetX = dir * 30 * p * (1 - retT * retT);
      }
      swordAngle = t < 0.5 ? 2 : 0;
      break;
    }
    case "hit": {
      // Knocked back, flash red
      const t = Math.min(1, elapsed / 20);
      offsetX = -dir * 15 * p * Math.sin(t * Math.PI);
      isFlashing = Math.floor(elapsed / 3) % 2 === 0 && elapsed < 18;
      break;
    }
    case "victory": {
      // Jump up, bounce
      const t = (elapsed % 40) / 40;
      const bouncePhase = Math.abs(Math.sin(t * Math.PI * 3));
      offsetY = -15 * p * bouncePhase * Math.max(0, 1 - elapsed / 120);
      swordAngle = 1;
      glowAlpha = 0.15 + 0.1 * Math.sin(frame * 0.1);
      break;
    }
    case "defeat": {
      // Fall to side
      const t = Math.min(1, elapsed / 25);
      fallAngle = (dir * Math.PI * 0.4 * t);
      isDesaturated = true;
      break;
    }
  }

  // Effective colors
  const mainColor = isFlashing
    ? "#FF2222"
    : isDesaturated
      ? desaturate(color, 70)
      : color;
  const mainLight = isFlashing
    ? "#FF6666"
    : isDesaturated
      ? desaturate(light, 70)
      : light;
  const mainDark = isFlashing
    ? "#CC0000"
    : isDesaturated
      ? desaturate(dark, 70)
      : dark;
  const mainDarkest = isFlashing
    ? "#990000"
    : isDesaturated
      ? desaturate(darkest, 70)
      : darkest;

  const bx = baseX + offsetX;
  const by = baseY + offsetY;

  ctx.save();

  // Apply fall rotation for defeat
  if (fallAngle !== 0) {
    ctx.translate(bx + 8 * p, by + 18 * p); // rotate around feet
    ctx.rotate(fallAngle);
    ctx.translate(-(bx + 8 * p), -(by + 18 * p));
  }

  // Victory glow
  if (glowAlpha > 0) {
    const [gr, gg, gb] = hexToRgb(mainColor);
    ctx.fillStyle = `rgba(${gr},${gg},${gb},${glowAlpha})`;
    ctx.fillRect(bx - 3 * p, by - 3 * p, 22 * p, 26 * p);
  }

  // Mirror drawing for left-facing warrior
  if (facing === "left") {
    ctx.save();
    ctx.translate(bx + 8 * p, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(bx + 8 * p), 0);
  }

  /* ---- Helmet ---- */
  ctx.fillStyle = mainColor;
  ctx.fillRect(bx + 5 * p, by, 6 * p, 2 * p); // top rim
  ctx.fillRect(bx + 4 * p, by + 2 * p, 8 * p, 4 * p); // main helmet

  /* ---- Visor ---- */
  ctx.fillStyle = mainDark;
  ctx.fillRect(bx + 5 * p, by + 3 * p, 6 * p, 2 * p);

  /* ---- Eyes ---- */
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx + 6 * p, by + 3 * p, p, p);
  ctx.fillRect(bx + 9 * p, by + 3 * p, p, p);
  ctx.fillStyle = "#000000";
  ctx.fillRect(bx + 6 * p, by + 4 * p, p, p);
  ctx.fillRect(bx + 9 * p, by + 4 * p, p, p);

  /* ---- Body / Armor ---- */
  ctx.fillStyle = mainColor;
  ctx.fillRect(bx + 4 * p, by + 6 * p, 8 * p, 8 * p);
  ctx.fillStyle = mainLight;
  ctx.fillRect(bx + 6 * p, by + 7 * p, 4 * p, 4 * p); // chest plate

  /* ---- Arms ---- */
  ctx.fillStyle = mainDark;
  ctx.fillRect(bx + 2 * p, by + 6 * p, 2 * p, 6 * p); // left arm (shield side)
  ctx.fillRect(bx + 12 * p, by + 6 * p, 2 * p, 6 * p); // right arm (sword side)

  /* ---- Sword (right hand) ---- */
  const swordBaseX = bx + 14 * p;
  if (swordAngle === 0) {
    // Sword at side, pointing down
    ctx.fillStyle = isDesaturated ? desaturate(GOLD_COLOR, 70) : GOLD_COLOR;
    ctx.fillRect(swordBaseX, by + 5 * p, 2 * p, 3 * p); // handle
    ctx.fillStyle = isDesaturated ? desaturate(SILVER_COLOR, 70) : SILVER_COLOR;
    ctx.fillRect(swordBaseX, by + 8 * p, 2 * p, 7 * p); // blade down
  } else if (swordAngle === 1) {
    // Sword raised high
    ctx.fillStyle = isDesaturated ? desaturate(GOLD_COLOR, 70) : GOLD_COLOR;
    ctx.fillRect(swordBaseX, by + 3 * p, 2 * p, 3 * p); // handle
    ctx.fillStyle = isDesaturated ? desaturate(SILVER_COLOR, 70) : SILVER_COLOR;
    ctx.fillRect(swordBaseX, by - 6 * p, 2 * p, 9 * p); // blade up
  } else if (swordAngle === 2) {
    // Sword swung forward (horizontal)
    ctx.fillStyle = isDesaturated ? desaturate(GOLD_COLOR, 70) : GOLD_COLOR;
    ctx.fillRect(swordBaseX, by + 6 * p, 2 * p, 3 * p); // handle
    ctx.fillStyle = isDesaturated ? desaturate(SILVER_COLOR, 70) : SILVER_COLOR;
    ctx.fillRect(swordBaseX + 2 * p, by + 6 * p, 8 * p, 2 * p); // blade forward
  }

  // Sword on ground for defeat
  if (state === "defeat" && elapsed > 15) {
    ctx.fillStyle = desaturate(GOLD_COLOR, 70);
    ctx.fillRect(bx + 16 * p, by + 18 * p, 2 * p, 2 * p);
    ctx.fillStyle = desaturate(SILVER_COLOR, 70);
    ctx.fillRect(bx + 18 * p, by + 17 * p, 6 * p, 2 * p);
  }

  /* ---- Shield (left hand) ---- */
  ctx.fillStyle = mainColor;
  ctx.fillRect(bx + 0 * p, by + 6 * p, 3 * p, 5 * p);
  // Shield emblem
  if (!isDesaturated) {
    if (facing === "right" || facing === "left") {
      // Alpha gets white cross, omega would be mirrored so both get their own
      // Since we mirror for left-facing, always draw the same way
      const isOmega = color === OMEGA_COLOR;
      if (isOmega) {
        // X emblem
        ctx.fillStyle = mainDark;
        ctx.fillRect(bx + 0 * p, by + 7 * p, p, p);
        ctx.fillRect(bx + 2 * p, by + 7 * p, p, p);
        ctx.fillRect(bx + 1 * p, by + 8 * p, p, p);
        ctx.fillRect(bx + 0 * p, by + 9 * p, p, p);
        ctx.fillRect(bx + 2 * p, by + 9 * p, p, p);
      } else {
        // White cross emblem
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx + 1 * p, by + 7 * p, p, 3 * p); // vertical
        ctx.fillRect(bx + 0 * p, by + 8 * p, 3 * p, p); // horizontal
      }
    }
  }

  /* ---- Legs ---- */
  ctx.fillStyle = mainDark;
  ctx.fillRect(bx + 5 * p, by + 14 * p, 2 * p, 4 * p);
  ctx.fillRect(bx + 9 * p, by + 14 * p, 2 * p, 4 * p);

  /* ---- Boots ---- */
  ctx.fillStyle = mainDarkest;
  ctx.fillRect(bx + 4 * p, by + 17 * p, 3 * p, 2 * p);
  ctx.fillRect(bx + 9 * p, by + 17 * p, 3 * p, 2 * p);

  if (facing === "left") {
    ctx.restore();
  }

  ctx.restore();
}
