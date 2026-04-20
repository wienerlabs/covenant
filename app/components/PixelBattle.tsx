"use client";

import { useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WarriorState = "idle" | "taunt" | "attack" | "hit" | "victory" | "defeat";

/** High-level battle category — drives themed arena backdrop. */
type BattleCategory = "code" | "art" | "text" | "music" | "research" | string;

interface PixelBattleProps {
  alphaState: WarriorState;
  omegaState: WarriorState;
  alphaHP: number;
  omegaHP: number;
  width?: number;
  height?: number;
  /** Battle category — drives themed arena backdrop (code grid / art palette / text paper). */
  category?: BattleCategory;
  /** Number of spectators — more viewers = denser crowd silhouettes. */
  viewerCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PIXEL_SIZE = 3;
const ALPHA_COLOR = "#42BDFF";
const OMEGA_COLOR = "#FF425E";
const GOLD_COLOR = "#FFE342";
const SILVER_COLOR = "#C0C0C0";

/** Combo window in frames (~60fps). A follow-up hit inside this window grows the combo. */
const COMBO_WINDOW = 90;
/** HP delta threshold above which a hit is treated as a "critical" hit. */
const CRIT_THRESHOLD = 18;
/** Max accumulated cracks per side (older ones get recycled). */
const MAX_CRACKS = 40;

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

/** Floating damage / status text that rises and fades. */
interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  /** Slight x velocity so stacked numbers don't overlap. */
  vx?: number;
  /** Base font scale. Crits / victory texts are larger. */
  scale?: number;
}

/** Persistent ground damage mark accumulated across the battle. */
interface Crack {
  x: number;
  y: number;
  size: number;
  color: string;
  /** Irregular orientation so cracks don't look uniform. */
  dir: number;
}

/** Per-side combo + crit tracking. */
interface ComboState {
  /** Consecutive hits within COMBO_WINDOW frames. */
  count: number;
  /** Frame the last hit landed on. */
  lastHitFrame: number;
}

/** Single head in the pixel-crowd silhouette at the bottom of the arena. */
interface CrowdHead {
  x: number;
  y: number;
  /** Height of the head block (6-9 px). */
  size: number;
  /** Independent phase so each head bobs slightly differently. */
  phase: number;
  /** Remaining frames of the current reaction hop (0 = idle). */
  hop: number;
  /** Whether this head is currently raising arms (victory reaction). */
  cheering: number;
}

/** Pulsing ring that represents a wave of crowd noise. */
interface ChantRing {
  x: number;
  y: number;
  /** Age in frames; radius grows with age. */
  age: number;
  /** Max age before removal. */
  maxAge: number;
  color: string;
}

/** Full-screen flash overlay (lightning for crits / victory). */
interface ScreenFlash {
  age: number;
  maxAge: number;
  color: string;
  intensity: number;
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
  category,
  viewerCount = 0,
}: PixelBattleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  // Screen shake
  const shakeRef = useRef({ intensity: 0, decay: 0.9 });

  // Track previous states to detect transitions
  const prevAlphaRef = useRef<WarriorState>("idle");
  const prevOmegaRef = useRef<WarriorState>("idle");

  // Animation progress for each state (0-1)
  const alphaAnimRef = useRef({ progress: 0, startFrame: 0 });
  const omegaAnimRef = useRef({ progress: 0, startFrame: 0 });

  // HP animation
  const alphaHPAnimRef = useRef(100);
  const omegaHPAnimRef = useRef(100);

  // Previous HP for damage number calculation
  const prevAlphaHPRef = useRef(100);
  const prevOmegaHPRef = useRef(100);

  // Persistent ground cracks accumulated through the battle (per-side).
  const cracksRef = useRef<Crack[]>([]);

  // Per-side combo state. A hit inside COMBO_WINDOW frames grows the combo.
  const alphaComboRef = useRef<ComboState>({ count: 0, lastHitFrame: -999 });
  const omegaComboRef = useRef<ComboState>({ count: 0, lastHitFrame: -999 });

  // Track last sweat-drop spawn frame per side so low-HP panting doesn't spam.
  const alphaSweatRef = useRef(0);
  const omegaSweatRef = useRef(0);

  // Pixel crowd silhouettes along the bottom of the arena. Lazily initialized
  // on first draw so dimensions / viewerCount are known.
  const crowdRef = useRef<CrowdHead[] | null>(null);

  // Parallax mountain / skyline silhouettes (3 layers). Generated once.
  const mountainsRef = useRef<{ near: number[]; mid: number[]; far: number[] } | null>(null);

  // Pulsing chant rings (ambient crowd noise waves).
  const chantRingsRef = useRef<ChantRing[]>([]);
  const lastChantFrameRef = useRef(0);

  // Lightning / victory screen flashes.
  const flashesRef = useRef<ScreenFlash[]>([]);

  /** Drop a small cluster of ground-crack pixels near a warrior's feet. */
  const spawnCrack = useCallback(
    (x: number, y: number, color: string, intensity: number) => {
      const count = 3 + Math.floor(intensity / 6);
      for (let i = 0; i < count; i++) {
        cracksRef.current.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y + (Math.random() - 0.5) * 3,
          size: 1 + Math.random() * 1.5,
          color,
          dir: Math.random() * Math.PI,
        });
      }
      // Recycle oldest marks so the array stays bounded.
      while (cracksRef.current.length > MAX_CRACKS * 2) {
        cracksRef.current.shift();
      }
    },
    [],
  );

  /** Drop a sweat bead that falls toward the ground — used for low HP panting. */
  const spawnSweat = useCallback((x: number, y: number) => {
    particlesRef.current.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.8 + Math.random() * 0.4,
      life: 22 + Math.random() * 10,
      maxLife: 30,
      color: "#9fd8ff",
      size: 2,
      type: "dust",
    });
  }, []);

  /** Queue a full-screen flash (lightning on crit, color-tinted on victory). */
  const triggerFlash = useCallback((color: string, intensity: number, duration = 12) => {
    flashesRef.current.push({ age: 0, maxAge: duration, color, intensity });
    // Only keep latest 3 to avoid stacking.
    while (flashesRef.current.length > 3) flashesRef.current.shift();
  }, []);

  /** Spawn a pulsing chant ring somewhere behind the action (ambient noise wave). */
  const spawnChantRing = useCallback(
    (x: number, y: number, color: string) => {
      chantRingsRef.current.push({
        x,
        y,
        age: 0,
        maxAge: 60,
        color,
      });
      while (chantRingsRef.current.length > 6) chantRingsRef.current.shift();
    },
    [],
  );

  /** Trigger a crowd reaction (hop on hit, cheer on victory). */
  const reactCrowd = useCallback((kind: "hop" | "cheer") => {
    const crowd = crowdRef.current;
    if (!crowd) return;
    for (const head of crowd) {
      if (Math.random() < (kind === "cheer" ? 0.7 : 0.45)) {
        if (kind === "cheer") head.cheering = 60 + Math.floor(Math.random() * 20);
        else head.hop = 8 + Math.floor(Math.random() * 4);
      }
    }
  }, []);

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
          setTimeout(() => {
            spawnParticles(alphaBaseX + 35 * p, warriorBaseY + 6 * p, 12, "spark", ALPHA_COLOR);
          }, 200);
        }
        if (alphaState === "hit") {
          const dmg = Math.round(prevAlphaHPRef.current - alphaHP);
          const isCrit = dmg >= CRIT_THRESHOLD;

          // Combo bookkeeping — Omega landed this hit on Alpha.
          const combo = omegaComboRef.current;
          if (frame - combo.lastHitFrame <= COMBO_WINDOW) {
            combo.count += 1;
          } else {
            combo.count = 1;
          }
          combo.lastHitFrame = frame;

          // Screen shake: harder for crits + extra shake per combo step.
          shakeRef.current.intensity = isCrit ? 14 : 8;
          if (combo.count >= 2) shakeRef.current.intensity += 2;

          // Damage number — red for normal, gold + bigger for crits.
          if (dmg > 0) {
            floatingTextsRef.current.push({
              x: alphaBaseX + 8 * p,
              y: warriorBaseY - 5 * p,
              text: isCrit ? `-${dmg}!!` : `-${dmg}`,
              color: isCrit ? GOLD_COLOR : "#FF4444",
              life: isCrit ? 55 : 40,
              maxLife: isCrit ? 55 : 40,
              vx: (Math.random() - 0.5) * 0.3,
              scale: isCrit ? 1.9 : 1.5,
            });
          }

          // KABOOM banner on crit + extra sparks.
          if (isCrit) {
            floatingTextsRef.current.push({
              x: alphaBaseX + 8 * p,
              y: warriorBaseY - 14 * p,
              text: "KABOOM!",
              color: GOLD_COLOR,
              life: 45,
              maxLife: 45,
              scale: 2,
            });
            spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 4 * p, 18, "spark", GOLD_COLOR);
          }

          // Combo banner (x2+).
          if (combo.count >= 2) {
            floatingTextsRef.current.push({
              x: alphaBaseX + 8 * p,
              y: warriorBaseY - 22 * p,
              text: `x${combo.count} COMBO!`,
              color: OMEGA_COLOR,
              life: 40,
              maxLife: 40,
              scale: 1.7,
            });
          }

          // Persistent ground crack at victim's feet.
          spawnCrack(alphaBaseX + 8 * p, groundY + 1, ALPHA_COLOR, dmg);

          // Atmosphere reactions — lightning flash on crit, crowd hop on any hit.
          if (isCrit) triggerFlash("#ffffff", 0.45, 8);
          reactCrowd("hop");
        }
        if (alphaState === "victory") {
          // Victory star burst — more particles for celebration
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY - 10 * p, 25, "star", GOLD_COLOR);
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY, 15, "spark", ALPHA_COLOR);
          floatingTextsRef.current.push({
            x: alphaBaseX + 2 * p, y: warriorBaseY - 20 * p,
            text: "VICTORY", color: GOLD_COLOR, life: 80, maxLife: 80,
          });
          triggerFlash(ALPHA_COLOR, 0.5, 18);
          reactCrowd("cheer");
        }
        if (alphaState === "defeat") {
          // Pixel scatter death — more dust particles erupting
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 10 * p, 20, "dust", ALPHA_COLOR);
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 5 * p, 10, "spark", ALPHA_COLOR);
          shakeRef.current.intensity = 5;
        }
        prevAlphaRef.current = alphaState;
      }
      prevAlphaHPRef.current = alphaHP;

      if (omegaState !== prevOmegaRef.current) {
        omegaAnimRef.current = { progress: 0, startFrame: frame };
        if (omegaState === "attack") {
          setTimeout(() => {
            spawnParticles(omegaBaseX - 35 * p, warriorBaseY + 6 * p, 12, "spark", OMEGA_COLOR);
          }, 200);
        }
        if (omegaState === "hit") {
          const dmg = Math.round(prevOmegaHPRef.current - omegaHP);
          const isCrit = dmg >= CRIT_THRESHOLD;

          const combo = alphaComboRef.current;
          if (frame - combo.lastHitFrame <= COMBO_WINDOW) {
            combo.count += 1;
          } else {
            combo.count = 1;
          }
          combo.lastHitFrame = frame;

          shakeRef.current.intensity = isCrit ? 14 : 8;
          if (combo.count >= 2) shakeRef.current.intensity += 2;

          if (dmg > 0) {
            floatingTextsRef.current.push({
              x: omegaBaseX - 8 * p,
              y: warriorBaseY - 5 * p,
              text: isCrit ? `-${dmg}!!` : `-${dmg}`,
              color: isCrit ? GOLD_COLOR : "#FF4444",
              life: isCrit ? 55 : 40,
              maxLife: isCrit ? 55 : 40,
              vx: (Math.random() - 0.5) * 0.3,
              scale: isCrit ? 1.9 : 1.5,
            });
          }

          if (isCrit) {
            floatingTextsRef.current.push({
              x: omegaBaseX - 8 * p,
              y: warriorBaseY - 14 * p,
              text: "KABOOM!",
              color: GOLD_COLOR,
              life: 45,
              maxLife: 45,
              scale: 2,
            });
            spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 4 * p, 18, "spark", GOLD_COLOR);
          }

          if (combo.count >= 2) {
            floatingTextsRef.current.push({
              x: omegaBaseX - 8 * p,
              y: warriorBaseY - 22 * p,
              text: `x${combo.count} COMBO!`,
              color: ALPHA_COLOR,
              life: 40,
              maxLife: 40,
              scale: 1.7,
            });
          }

          spawnCrack(omegaBaseX - 8 * p, groundY + 1, OMEGA_COLOR, dmg);

          if (isCrit) triggerFlash("#ffffff", 0.45, 8);
          reactCrowd("hop");
        }
        if (omegaState === "victory") {
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY - 10 * p, 25, "star", GOLD_COLOR);
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY, 15, "spark", OMEGA_COLOR);
          floatingTextsRef.current.push({
            x: omegaBaseX - 14 * p, y: warriorBaseY - 20 * p,
            text: "VICTORY", color: GOLD_COLOR, life: 80, maxLife: 80,
          });
          triggerFlash(OMEGA_COLOR, 0.5, 18);
          reactCrowd("cheer");
        }
        if (omegaState === "defeat") {
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 10 * p, 20, "dust", OMEGA_COLOR);
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 5 * p, 10, "spark", OMEGA_COLOR);
          shakeRef.current.intensity = 5;
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

      /* ---- Screen shake ---- */
      const shake = shakeRef.current;
      if (shake.intensity > 0.5) {
        shake.intensity *= shake.decay;
      } else {
        shake.intensity = 0;
      }
      const shakeX = shake.intensity > 0 ? (Math.random() - 0.5) * shake.intensity : 0;
      const shakeY = shake.intensity > 0 ? (Math.random() - 0.5) * shake.intensity : 0;

      /* ---- Clear canvas ---- */
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(shakeX, shakeY);

      /* ---- Ambient dust particles ---- */
      if (frame % 30 === 0) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.2 - Math.random() * 0.3,
          life: 60 + Math.random() * 40,
          maxLife: 100,
          color: "rgba(255,255,255,0.15)",
          size: 1,
          type: "dust",
        });
      }

      /* ---- Parallax mountain / skyline layers (initialized lazily) ---- */
      if (!mountainsRef.current) {
        mountainsRef.current = generateMountains(width, height);
      }
      drawMountains(ctx, mountainsRef.current, width, height, groundY, frame, shakeX);

      /* ---- Category-themed arena backdrop (code grid / art palette / text paper) ---- */
      drawCategoryBackdrop(ctx, width, height, groundY, category, frame);

      /* ---- Ambient chant rings (crowd noise waves) ---- */
      // Spawn a new ring every ~70 frames, scaled by viewerCount presence.
      if (viewerCount > 0 && frame - lastChantFrameRef.current > 70) {
        const side = Math.random() < 0.5 ? 0.15 : 0.85;
        spawnChantRing(
          width * side,
          groundY - 30 - Math.random() * 30,
          Math.random() < 0.5 ? ALPHA_COLOR : OMEGA_COLOR,
        );
        lastChantFrameRef.current = frame;
      }
      // Update + draw rings
      const aliveRings: ChantRing[] = [];
      for (const ring of chantRingsRef.current) {
        ring.age++;
        if (ring.age < ring.maxAge) {
          const t = ring.age / ring.maxAge;
          const radius = 6 + t * 42;
          const alpha = (1 - t) * 0.22;
          const [rr, rg, rb] = hexToRgb(ring.color);
          ctx.strokeStyle = `rgba(${rr},${rg},${rb},${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          aliveRings.push(ring);
        }
      }
      chantRingsRef.current = aliveRings;

      /* ---- Pixel crowd silhouettes (near ground, in front of mountains) ---- */
      if (!crowdRef.current) {
        crowdRef.current = generateCrowd(width, groundY, viewerCount);
      }
      drawCrowd(ctx, crowdRef.current, frame);

      /* ---- Draw ground line + texture ---- */
      // Ground shadow gradient
      const groundGrad = ctx.createLinearGradient(0, groundY - 3, 0, groundY + 10);
      groundGrad.addColorStop(0, "transparent");
      groundGrad.addColorStop(0.3, "rgba(26,26,46,0.5)");
      groundGrad.addColorStop(1, "#1a1a2e");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY - 3, width, 13);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, groundY, width, 10);
      // Ground line highlight
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, groundY, width, 1);
      // Variation patches
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

      /* ---- Persistent ground cracks (accumulated damage marks) ---- */
      for (const c of cracksRef.current) {
        // Soft tinted underlay + bright core
        const [cr, cg, cb] = hexToRgb(c.color);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.18)`;
        const dx = Math.cos(c.dir) * 3;
        const dy = Math.sin(c.dir) * 1.2;
        ctx.fillRect(c.x - dx, c.y - dy, c.size + 2, c.size + 1);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.55)`;
        ctx.fillRect(c.x, c.y, c.size, c.size);
        // Tiny highlight flecks so cracks read at distance
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(c.x + dx, c.y + 1, 1, 1);
      }

      /* ---- Warrior shadows on ground ---- */
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(alphaBaseX + 8 * p, groundY + 1, 12 * p, 3 * p, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(omegaBaseX + 8 * p, groundY + 1, 12 * p, 3 * p, 0, 0, Math.PI * 2);
      ctx.fill();

      /* ---- Low HP panting: spawn sweat drops periodically ---- */
      if (alphaHP < 30 && alphaHP > 0 && frame - alphaSweatRef.current > 28) {
        spawnSweat(alphaBaseX + 4 * p, warriorBaseY - 2 * p);
        alphaSweatRef.current = frame;
      }
      if (omegaHP < 30 && omegaHP > 0 && frame - omegaSweatRef.current > 28) {
        spawnSweat(omegaBaseX - 4 * p, warriorBaseY - 2 * p);
        omegaSweatRef.current = frame;
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
        omegaBaseX,
        alphaHP,
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
        alphaBaseX,
        omegaHP,
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

      /* ---- Draw floating damage/status texts ---- */
      const aliveTexts: FloatingText[] = [];
      for (const ft of floatingTextsRef.current) {
        ft.life--;
        ft.y -= 0.8; // float upward
        if (ft.vx) ft.x += ft.vx;
        if (ft.life > 0) {
          const alpha = Math.max(0, ft.life / ft.maxLife);
          const scale = ft.scale ?? (ft.text === "VICTORY" ? 2 : 1.5);
          // Crit / combo banners get a subtle pop as they appear.
          const pop = ft.life > ft.maxLife - 6 ? 1 + (ft.maxLife - ft.life) * 0.06 : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = `bold ${Math.round(10 * scale * pop)}px monospace`;
          ctx.textAlign = "center";
          // Shadow
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
          // Text
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
          aliveTexts.push(ft);
        }
      }
      floatingTextsRef.current = aliveTexts;

      /* ---- Close screen shake transform ---- */
      ctx.restore();

      /* ---- Lightning / victory flashes (full-screen tint overlay) ---- */
      const aliveFlashes: ScreenFlash[] = [];
      for (const f of flashesRef.current) {
        f.age++;
        if (f.age < f.maxAge) {
          const t = f.age / f.maxAge;
          // Fast attack, slower decay — classic lightning feel.
          const envelope = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
          const a = Math.max(0, envelope) * f.intensity;
          const [fr, fg, fb] = hexToRgb(f.color);
          ctx.fillStyle = `rgba(${fr},${fg},${fb},${a})`;
          ctx.fillRect(0, 0, width, height);
          aliveFlashes.push(f);
        }
      }
      flashesRef.current = aliveFlashes;

      /* ---- CRT scanline overlay ---- */
      ctx.save();
      ctx.globalAlpha = 0.04;
      for (let sy = 0; sy < height; sy += 3) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, sy, width, 1);
      }
      ctx.restore();
    },
    [
      alphaState,
      omegaState,
      alphaHP,
      omegaHP,
      width,
      height,
      spawnParticles,
      spawnCrack,
      spawnSweat,
      category,
      viewerCount,
      triggerFlash,
      spawnChantRing,
      reactCrowd,
    ],
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

  // Bar fill with gradient color: green(>50) → yellow(>25) → red(<=25)
  const fillW = Math.max(0, (hp / 100) * (w - 2));
  let fillColor: string;
  if (hp > 50) {
    fillColor = "#22CC44"; // green
  } else if (hp > 25) {
    fillColor = GOLD_COLOR; // yellow
  } else {
    // Critical red with subtle pulse
    const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
    const r = Math.round(255 * pulse);
    fillColor = `rgb(${r},34,34)`;
  }
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

/**
 * Space Invader sprite maps. Each row is an array of 0/1/2 values:
 *   0 = transparent
 *   1 = main color
 *   2 = dark accent
 * Alpha = squid type, Omega = crab type.
 */
const SPRITE_ALPHA = [
  // Squid invader (11 wide x 8 tall)
  [0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,1,1,2,1,2,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,0,1,1,1,0,1,0,0],
  [0,1,0,0,0,0,0,0,0,1,0],
  [0,0,1,0,0,0,0,0,1,0,0],
];
const SPRITE_ALPHA_WALK = [
  [0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,1,1,2,1,2,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,0,1,1,1,0,1,0,0],
  [0,0,0,1,0,0,0,1,0,0,0],
  [0,1,1,0,0,0,0,0,1,1,0],
];

const SPRITE_OMEGA = [
  // Crab invader (11 wide x 8 tall)
  [0,0,1,0,0,0,0,0,1,0,0],
  [0,0,0,1,0,0,0,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0],
  [0,1,1,2,1,1,1,2,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1],
  [1,0,1,1,1,1,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,1,0,1],
  [0,0,0,1,1,0,1,1,0,0,0],
];
const SPRITE_OMEGA_WALK = [
  [0,0,1,0,0,0,0,0,1,0,0],
  [0,0,0,1,0,0,0,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0],
  [0,1,1,2,1,1,1,2,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1],
  [1,0,1,1,1,1,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,1,0,1],
  [0,1,0,0,0,0,0,0,0,1,0],
];

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
  /** Horizontal position of the opponent — used for eye tracking. */
  opponentX: number,
  /** Current HP (0-100) — drives panting amplitude + low-HP eye recolor. */
  hp: number,
) {
  const dark = darken(color, 40);
  const dir = facing === "right" ? 1 : -1;
  const elapsed = frame - animState.startFrame;
  const lowHP = hp > 0 && hp < 30;

  /* ---- Compute offsets based on state ---- */
  let offsetX = 0;
  let offsetY = 0;
  let isFlashing = false;
  let isDesaturated = false;
  let fallAngle = 0;
  let glowAlpha = 0;
  let scaleX = 1;
  let scaleY = 1;

  switch (state) {
    case "idle": {
      // Low HP → heavier breathing (2.5x amplitude + slightly faster).
      const amp = lowHP ? 4.2 : 1.5;
      const speed = lowHP ? 0.11 : 0.06;
      offsetY = Math.sin(frame * speed) * p * amp;
      break;
    }
    case "taunt": {
      const t = Math.min(1, elapsed / 15);
      offsetX = dir * 5 * p * Math.sin(t * Math.PI);
      scaleX = 1 + 0.1 * Math.sin(t * Math.PI);
      break;
    }
    case "attack": {
      const t = Math.min(1, elapsed / 25);
      if (t < 0.4) {
        offsetX = dir * 40 * p * (t / 0.4) * (t / 0.4);
      } else if (t < 0.6) {
        offsetX = dir * 40 * p;
        scaleX = 1.2;
        scaleY = 0.85;
      } else {
        const retT = (t - 0.6) / 0.4;
        offsetX = dir * 40 * p * (1 - retT * retT);
      }
      break;
    }
    case "hit": {
      const t = Math.min(1, elapsed / 20);
      offsetX = -dir * 18 * p * Math.sin(t * Math.PI);
      isFlashing = Math.floor(elapsed / 3) % 2 === 0 && elapsed < 18;
      scaleX = 1 + 0.15 * Math.sin(t * Math.PI * 3);
      break;
    }
    case "victory": {
      const t = (elapsed % 40) / 40;
      offsetY = -18 * p * Math.abs(Math.sin(t * Math.PI * 3)) * Math.max(0, 1 - elapsed / 120);
      glowAlpha = 0.2 + 0.15 * Math.sin(frame * 0.1);
      scaleX = 1 + 0.05 * Math.sin(frame * 0.15);
      scaleY = 1 + 0.05 * Math.cos(frame * 0.15);
      break;
    }
    case "defeat": {
      const t = Math.min(1, elapsed / 25);
      fallAngle = dir * Math.PI * 0.5 * t;
      isDesaturated = true;
      scaleY = 1 - 0.3 * t;
      break;
    }
  }

  // Choose sprite based on creature type + walk cycle
  const isOmega = color === OMEGA_COLOR;
  const walkFrame = Math.floor(frame / 10) % 2 === 0;
  let sprite: number[][];
  if (isOmega) {
    sprite = walkFrame ? SPRITE_OMEGA_WALK : SPRITE_OMEGA;
  } else {
    sprite = walkFrame ? SPRITE_ALPHA_WALK : SPRITE_ALPHA;
  }

  // Colors
  const mainColor = isFlashing ? "#FF2222" : isDesaturated ? desaturate(color, 70) : color;
  const accentColor = isFlashing ? "#CC0000" : isDesaturated ? desaturate(dark, 70) : dark;
  const eyeColor = isFlashing ? "#FFAAAA" : "#ffffff";

  const bx = baseX + offsetX;
  const by = baseY + offsetY;
  const spriteW = sprite[0].length;
  const spriteH = sprite.length;
  // Center the sprite
  const drawX = bx - (spriteW * p * scaleX) / 2;
  const drawY = by - (spriteH * p * scaleY) / 2 + 4 * p;

  ctx.save();

  // Fall rotation for defeat
  if (fallAngle !== 0) {
    ctx.translate(bx, by + 8 * p);
    ctx.rotate(fallAngle);
    ctx.translate(-bx, -(by + 8 * p));
  }

  // Victory glow
  if (glowAlpha > 0) {
    const [gr, gg, gb] = hexToRgb(mainColor);
    ctx.fillStyle = `rgba(${gr},${gg},${gb},${glowAlpha})`;
    ctx.beginPath();
    ctx.arc(bx, by + 4 * p, spriteW * p * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- Charge-up aura (first ~35% of attack — builds tension before beam) ---- */
  if (state === "attack") {
    const t = Math.min(1, elapsed / 25);
    if (t < 0.35) {
      const auraT = t / 0.35;
      const baseR = spriteW * p * 0.45;
      const radius = baseR + auraT * baseR * 0.9;
      const [ar, ag, ab] = hexToRgb(color);
      const cx = bx;
      const cy = by + 4 * p;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${ar},${ag},${ab},${0.55 * (1 - auraT)})`);
      grad.addColorStop(0.55, `rgba(${ar},${ag},${ab},${0.28 * (1 - auraT)})`);
      grad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      // Crackling ring — 6 rotating white pixels form an orbit of static.
      const ringR = radius * 0.82;
      for (let i = 0; i < 6; i++) {
        const ang = (frame * 0.22 + (i * Math.PI) / 3) % (Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          cx + Math.cos(ang) * ringR - 1,
          cy + Math.sin(ang) * ringR - 1,
          2,
          2,
        );
      }
    }
  }

  // Mirror for left-facing
  if (facing === "left") {
    ctx.translate(bx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-bx, 0);
  }

  /* ---- Draw sprite pixels (skip eyes — eyes are drawn separately for tracking) ---- */
  for (let row = 0; row < spriteH; row++) {
    for (let col = 0; col < spriteW; col++) {
      const val = sprite[row][col];
      if (val === 0 || val === 2) continue;
      ctx.fillStyle = val === 1 ? mainColor : accentColor;
      ctx.fillRect(
        drawX + col * p * scaleX,
        drawY + row * p * scaleY,
        Math.ceil(p * scaleX),
        Math.ceil(p * scaleY),
      );
    }
  }

  /* ---- Eye tracking — shift eyes toward opponent + low-HP red recolor ---- */
  {
    void opponentX; // direction handled via `facing`; opponentX reserved for vertical tracking later
    const eyeShiftX = 1; // in sprite coords, +1 == toward opponent for both sides thanks to mirroring
    const lowHPEye = hp > 0 && hp < 25;
    // Blink every ~90 frames (closed for 3 frames) — keeps sprites alive.
    const blinking = Math.floor(frame / 90) !== Math.floor((frame - 3) / 90) && frame % 90 < 3;
    const finalEyeColor = blinking
      ? mainColor
      : isFlashing
        ? "#FFAAAA"
        : lowHPEye
          ? Math.floor(frame / 8) % 2 === 0
            ? "#FF4A4A"
            : "#FFB0B0"
          : "#FFFFFF";
    for (let row = 0; row < spriteH; row++) {
      for (let col = 0; col < spriteW; col++) {
        if (sprite[row][col] !== 2) continue;
        // Fill original eye slot with body color (so the shift doesn't leave a gap).
        ctx.fillStyle = mainColor;
        ctx.fillRect(
          drawX + col * p * scaleX,
          drawY + row * p * scaleY,
          Math.ceil(p * scaleX),
          Math.ceil(p * scaleY),
        );
        // Draw tracking eye shifted by +1 pixel cell toward opponent.
        ctx.fillStyle = finalEyeColor;
        ctx.fillRect(
          drawX + (col + eyeShiftX) * p * scaleX,
          drawY + row * p * scaleY,
          Math.ceil(p * scaleX),
          Math.ceil(p * scaleY),
        );
      }
    }
  }

  // Attack beam — shoot a pixel projectile during attack
  if (state === "attack") {
    const t = Math.min(1, elapsed / 25);
    if (t > 0.3 && t < 0.7) {
      const beamLen = 20 * p * ((t - 0.3) / 0.4);
      ctx.fillStyle = mainColor;
      const beamY = drawY + 4 * p;
      ctx.fillRect(bx + (facing === "right" ? 6 * p : -6 * p - beamLen), beamY, beamLen, p);
      ctx.fillStyle = eyeColor;
      ctx.fillRect(bx + (facing === "right" ? 6 * p + beamLen : -6 * p - beamLen), beamY, 2 * p, p);
    }
  }

  ctx.restore();
}

/* ================================================================== */
/*  Atmosphere: parallax mountains, crowd silhouettes, themed arena    */
/* ================================================================== */

/**
 * Generate three parallax layers of mountain / skyline pixel heights.
 * Each layer is an array of column heights; draw fills up from the ground.
 */
function generateMountains(
  width: number,
  _height: number,
): { near: number[]; mid: number[]; far: number[] } {
  void _height;
  function seedRand(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }
  function buildRidge(columns: number, peakRange: [number, number], seed: number): number[] {
    const rand = seedRand(seed);
    const out: number[] = [];
    let h = peakRange[0] + rand() * (peakRange[1] - peakRange[0]);
    for (let i = 0; i < columns; i++) {
      h += (rand() - 0.5) * (peakRange[1] - peakRange[0]) * 0.35;
      h = Math.max(peakRange[0], Math.min(peakRange[1], h));
      out.push(Math.round(h));
    }
    return out;
  }
  const cols = Math.ceil(width / 2);
  return {
    far: buildRidge(cols, [14, 30], 11),
    mid: buildRidge(cols, [22, 52], 7),
    near: buildRidge(cols, [34, 70], 3),
  };
}

/** Draw parallax mountains. Shake dampens per-layer (far layers barely move). */
function drawMountains(
  ctx: CanvasRenderingContext2D,
  m: { near: number[]; mid: number[]; far: number[] },
  width: number,
  height: number,
  groundY: number,
  frame: number,
  shakeX: number,
) {
  // Subtle horizontal scroll — arena feels alive even when sprites are idle.
  const scroll = (frame * 0.05) % width;
  const layers: Array<{ data: number[]; color: string; shakeMul: number; scrollMul: number }> = [
    { data: m.far, color: "#181a35", shakeMul: 0.1, scrollMul: 0.2 },
    { data: m.mid, color: "#222450", shakeMul: 0.35, scrollMul: 0.5 },
    { data: m.near, color: "#2d2f66", shakeMul: 0.7, scrollMul: 1 },
  ];
  for (const layer of layers) {
    const sx = -shakeX * layer.shakeMul;
    ctx.fillStyle = layer.color;
    for (let i = 0; i < layer.data.length; i++) {
      const x = (i * 2 + sx + scroll * layer.scrollMul) % width;
      const finalX = x < 0 ? x + width : x;
      const h = layer.data[i];
      ctx.fillRect(finalX, groundY - h, 2, h);
    }
  }
  // Tiny dotted stars in the far layer sky
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 18; i++) {
    const sx = ((i * 47) + (frame >> 5)) % width;
    const sy = ((i * 29) % (height - 90)) + 6;
    ctx.fillRect(sx, sy, 1, 1);
  }
}

/**
 * Category-themed backdrop overlays a subtle pattern so different battle
 * categories feel visually distinct. Low opacity so it never upstages the
 * warriors.
 */
function drawCategoryBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  groundY: number,
  category: BattleCategory | undefined,
  frame: number,
) {
  if (!category) return;
  const lc = String(category).toLowerCase();

  if (lc.includes("code")) {
    // Green terminal grid
    ctx.strokeStyle = "rgba(80,220,120,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, groundY);
      ctx.stroke();
    }
    for (let y = 0; y < groundY; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    // Occasional scrolling "01" glyphs
    ctx.fillStyle = "rgba(120,255,160,0.14)";
    ctx.font = "bold 9px monospace";
    for (let i = 0; i < 8; i++) {
      const x = (i * 83 + (frame * 0.4)) % width;
      const y = ((i * 37 + frame * 0.3) % (groundY - 20)) + 10;
      ctx.fillText(i % 2 === 0 ? "10" : "01", x, y);
    }
  } else if (lc.includes("art") || lc.includes("image") || lc.includes("design")) {
    // Soft color splotches — artist palette vibe
    const palette = ["#FF6B9D", "#FFC857", "#4ECDC4", "#B983FF", "#FF9A76"];
    for (let i = 0; i < 5; i++) {
      const px = ((i * 137 + (frame * 0.12)) % (width + 80)) - 40;
      const py = 20 + ((i * 53) % (groundY - 60));
      const r = 22 + (i % 3) * 6;
      const col = palette[i % palette.length];
      const [pr, pg, pb] = hexToRgb(col);
      ctx.fillStyle = `rgba(${pr},${pg},${pb},0.08)`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (lc.includes("text") || lc.includes("writ") || lc.includes("story")) {
    // Faint horizontal paper-lines
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let y = 30; y < groundY; y += 14) {
      ctx.fillRect(20, y, width - 40, 1);
    }
    // Drifting quill-tick marks
    ctx.fillStyle = "rgba(255,240,200,0.14)";
    for (let i = 0; i < 5; i++) {
      const x = ((i * 191 + frame * 0.25) % width);
      const y = 30 + ((i * 37) % (groundY - 50));
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x + 3, y + 1, 3, 1);
    }
  } else if (lc.includes("music") || lc.includes("audio") || lc.includes("sound")) {
    // EQ-style vertical bars pulsing in the bg
    ctx.fillStyle = "rgba(180,120,255,0.08)";
    const bars = 32;
    const barW = Math.floor(width / bars);
    for (let i = 0; i < bars; i++) {
      const h = 10 + Math.abs(Math.sin(frame * 0.05 + i * 0.3)) * 60;
      ctx.fillRect(i * barW, groundY - h, barW - 1, h);
    }
  } else if (lc.includes("research") || lc.includes("science") || lc.includes("data")) {
    // Molecular / lattice dots
    ctx.fillStyle = "rgba(130,200,255,0.14)";
    for (let y = 16; y < groundY; y += 18) {
      for (let x = 16; x < width; x += 18) {
        const off = Math.sin(frame * 0.04 + x * 0.1 + y * 0.1) * 2;
        ctx.fillRect(x + off, y, 2, 2);
      }
    }
  }
  // Height param reserved for future ceiling FX.
  void height;
}

/** Generate deterministic crowd head positions scaled by viewer count. */
function generateCrowd(width: number, groundY: number, viewerCount: number): CrowdHead[] {
  const baseCount = 14;
  const bonus = Math.min(22, Math.floor(Math.log2(Math.max(1, viewerCount)) * 4));
  const count = baseCount + bonus;
  const heads: CrowdHead[] = [];
  // Seeded pseudo-random for reproducibility across renders.
  let s = 0xC0FFEE;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < count; i++) {
    const x = rand() * (width - 8);
    // Tight stagger right above the ground.
    const y = groundY - 6 - Math.floor(rand() * 4);
    const size = 6 + Math.floor(rand() * 3);
    heads.push({
      x,
      y,
      size,
      phase: rand() * Math.PI * 2,
      hop: 0,
      cheering: 0,
    });
  }
  // Sort by x so drawing is left→right (stable visual order).
  heads.sort((a, b) => a.x - b.x);
  return heads;
}

/** Draw the pixel-silhouette crowd. Hops on hits, raises arms on cheer. */
function drawCrowd(ctx: CanvasRenderingContext2D, heads: CrowdHead[], frame: number) {
  for (const head of heads) {
    // Idle gentle bob
    const bob = Math.sin(frame * 0.04 + head.phase) * 0.6;
    let liftY = bob;
    // Hop reaction on hits
    if (head.hop > 0) {
      liftY -= Math.sin((1 - head.hop / 12) * Math.PI) * 5;
      head.hop--;
    }
    // Cheer — raised arms + steady float
    const cheer = head.cheering > 0;
    if (cheer) {
      liftY -= 2 + Math.sin(frame * 0.2 + head.phase) * 1.2;
      head.cheering--;
    }
    const hx = Math.round(head.x);
    const hy = Math.round(head.y + liftY);

    // Body (shoulders) — darker underlay
    ctx.fillStyle = "#111126";
    ctx.fillRect(hx - 1, hy + head.size - 2, head.size + 2, 3);
    // Head
    ctx.fillStyle = "#1d1f40";
    ctx.fillRect(hx, hy, head.size, head.size - 2);
    // Tiny highlight pixel (eye)
    ctx.fillStyle = cheer ? "#ffd24a" : "rgba(255,255,255,0.3)";
    ctx.fillRect(hx + 1, hy + 2, 1, 1);
    // Raised arms on cheer — two pixel sticks pointing up
    if (cheer) {
      ctx.fillStyle = "#1d1f40";
      ctx.fillRect(hx - 1, hy - 2, 1, 3);
      ctx.fillRect(hx + head.size, hy - 2, 1, 3);
    }
  }
}
