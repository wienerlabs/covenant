"use client";

import { useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WarriorState =
  | "idle"
  | "taunt"
  | "attack"
  | "hit"
  | "victory"
  | "defeat"
  /** Sprite side-steps the incoming hit, leaving a translucent afterimage. */
  | "dodge";

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
  /** Per-agent category — drives weapon/tool overlay (brush, keyboard, pen, note, atom). */
  alphaCategory?: BattleCategory;
  omegaCategory?: BattleCategory;
  /** Round timer fill (0-1). When provided, a pixel hourglass appears top-left. */
  roundTimerPct?: number;
  /** Spectator's predicted winner — tints that side's arena edge with a flare. */
  predictionSide?: "alpha" | "omega" | null;
  /**
   * Rolling buffer of emojis dropped by spectators. When this array's length
   * grows, new entries spawn pixel emoji projectiles flying across the arena.
   */
  spectatorEmojis?: string[];
  /**
   * Rolling buffer of spectator chat messages. New entries drift across the
   * edges of the arena as pixel speech bubbles.
   */
  chatMessages?: string[];
  /** Tournament round (1-3) — drives day/night sky cycle. */
  tournamentRound?: number;
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

/** Walk-on intro length in frames (~60fps → 1 second). */
const INTRO_DURATION = 60;

/** Freeze-frame length when a KO blow lands (~0.4s). */
const FREEZE_DURATION = 24;

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
  alphaCategory,
  omegaCategory,
  roundTimerPct,
  predictionSide,
  spectatorEmojis,
  chatMessages,
  tournamentRound,
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

  // Walk-on intro — runs on mount. Sprites slide in from the edges, pose,
  // then settle. Zero = first-frame; increments each frame to INTRO_DURATION.
  const introFrameRef = useRef(0);
  /** One-shot guard for the "FIGHT!" banner that plays when the intro ends. */
  const didShowFightRef = useRef(false);

  // KO freeze frame — when victory/defeat first fires, freeze animations for
  // FREEZE_DURATION frames so the decisive blow lingers.
  const freezeUntilRef = useRef(-1);

  // Clash detection — guarded frame counter so the banner only fires once
  // per simultaneous attack window.
  const lastClashFrameRef = useRef(-999);

  // Ultimate gauge per side (0-100). Fills as the OPPOSITE side takes damage.
  const alphaUltRef = useRef(0);
  const omegaUltRef = useRef(0);

  // Track whether each side has consumed their ultimate on the current attack.
  const alphaUltConsumedRef = useRef(false);
  const omegaUltConsumedRef = useRef(false);

  // Spectator emoji projectiles drifting across the arena.
  const emojiProjectilesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    emoji: string;
    age: number;
    maxAge: number;
  }>>([]);
  /** Track how many emojis we've already consumed from the parent's buffer. */
  const emojiConsumedCountRef = useRef(0);

  // Chat speech bubbles drifting across the edges.
  const chatProjectilesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    text: string;
    age: number;
    maxAge: number;
  }>>([]);
  const chatConsumedCountRef = useRef(0);

  // Afterimage ghosts left behind by dodges.
  const afterimagesRef = useRef<Array<{
    x: number;
    y: number;
    color: string;
    sprite: number[][];
    facing: "left" | "right";
    age: number;
    maxAge: number;
  }>>([]);

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
          // Ultimate consumption — if gauge is full, unleash upgraded attack.
          if (alphaUltRef.current >= 100) {
            alphaUltConsumedRef.current = true;
            alphaUltRef.current = 0;
            floatingTextsRef.current.push({
              x: alphaBaseX + 8 * p,
              y: warriorBaseY - 22 * p,
              text: "ULTIMATE!",
              color: GOLD_COLOR,
              life: 55,
              maxLife: 55,
              scale: 2.1,
            });
            spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 4 * p, 20, "star", GOLD_COLOR);
            triggerFlash(GOLD_COLOR, 0.4, 10);
          } else {
            alphaUltConsumedRef.current = false;
          }
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
          // Opposite side (Omega) gains ultimate for landing this hit.
          omegaUltRef.current = Math.min(100, omegaUltRef.current + dmg * 2.4);
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
          // KO freeze — let the decisive blow linger
          freezeUntilRef.current = frame + FREEZE_DURATION;
        }
        if (alphaState === "defeat") {
          // Pixel scatter death — more dust particles erupting
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 10 * p, 20, "dust", ALPHA_COLOR);
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 5 * p, 10, "spark", ALPHA_COLOR);
          shakeRef.current.intensity = 5;
          freezeUntilRef.current = frame + FREEZE_DURATION;
        }
        if (alphaState === "dodge") {
          // Push an afterimage ghost at Alpha's previous position
          const walkFrame = Math.floor(frame / 10) % 2 === 0;
          const sprite = walkFrame ? SPRITE_ALPHA_WALK : SPRITE_ALPHA;
          afterimagesRef.current.push({
            x: alphaBaseX,
            y: warriorBaseY,
            color: ALPHA_COLOR,
            sprite,
            facing: "right",
            age: 0,
            maxAge: 22,
          });
          floatingTextsRef.current.push({
            x: alphaBaseX + 8 * p,
            y: warriorBaseY - 8 * p,
            text: "MISS!",
            color: "#ffffff",
            life: 35,
            maxLife: 35,
            scale: 1.6,
          });
          spawnParticles(alphaBaseX + 8 * p, warriorBaseY + 4 * p, 6, "dust", ALPHA_COLOR);
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
          if (omegaUltRef.current >= 100) {
            omegaUltConsumedRef.current = true;
            omegaUltRef.current = 0;
            floatingTextsRef.current.push({
              x: omegaBaseX - 8 * p,
              y: warriorBaseY - 22 * p,
              text: "ULTIMATE!",
              color: GOLD_COLOR,
              life: 55,
              maxLife: 55,
              scale: 2.1,
            });
            spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 4 * p, 20, "star", GOLD_COLOR);
            triggerFlash(GOLD_COLOR, 0.4, 10);
          } else {
            omegaUltConsumedRef.current = false;
          }
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
          alphaUltRef.current = Math.min(100, alphaUltRef.current + dmg * 2.4);
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
          freezeUntilRef.current = frame + FREEZE_DURATION;
        }
        if (omegaState === "defeat") {
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 10 * p, 20, "dust", OMEGA_COLOR);
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 5 * p, 10, "spark", OMEGA_COLOR);
          shakeRef.current.intensity = 5;
          freezeUntilRef.current = frame + FREEZE_DURATION;
        }
        if (omegaState === "dodge") {
          const walkFrame = Math.floor(frame / 10) % 2 === 0;
          const sprite = walkFrame ? SPRITE_OMEGA_WALK : SPRITE_OMEGA;
          afterimagesRef.current.push({
            x: omegaBaseX,
            y: warriorBaseY,
            color: OMEGA_COLOR,
            sprite,
            facing: "left",
            age: 0,
            maxAge: 22,
          });
          floatingTextsRef.current.push({
            x: omegaBaseX - 8 * p,
            y: warriorBaseY - 8 * p,
            text: "MISS!",
            color: "#ffffff",
            life: 35,
            maxLife: 35,
            scale: 1.6,
          });
          spawnParticles(omegaBaseX - 8 * p, warriorBaseY + 4 * p, 6, "dust", OMEGA_COLOR);
        }
        prevOmegaRef.current = omegaState;
      }

      /* ---- Clash detection — both warriors attacking at the same time ---- */
      if (
        alphaState === "attack" &&
        omegaState === "attack" &&
        frame - lastClashFrameRef.current > 45
      ) {
        const aElapsed = frame - alphaAnimRef.current.startFrame;
        const oElapsed = frame - omegaAnimRef.current.startFrame;
        // Both near their impact frame (t ~0.5)
        if (aElapsed > 10 && aElapsed < 16 && oElapsed > 10 && oElapsed < 16) {
          lastClashFrameRef.current = frame;
          const mx = (alphaBaseX + omegaBaseX) / 2;
          const my = warriorBaseY + 4 * p;
          floatingTextsRef.current.push({
            x: mx,
            y: my - 18 * p,
            text: "CLASH!",
            color: GOLD_COLOR,
            life: 45,
            maxLife: 45,
            scale: 2,
          });
          spawnParticles(mx, my, 24, "spark", GOLD_COLOR);
          spawnParticles(mx, my, 10, "star", "#ffffff");
          shakeRef.current.intensity = 12;
          triggerFlash("#ffffff", 0.3, 6);
        }
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

      /* ---- Day/night sky gradient (drives atmosphere behind mountains) ---- */
      drawSky(ctx, width, groundY, tournamentRound, frame);

      /* ---- Parallax mountain / skyline layers (initialized lazily) ---- */
      if (!mountainsRef.current) {
        mountainsRef.current = generateMountains(width, height);
      }
      drawMountains(ctx, mountainsRef.current, width, height, groundY, frame, shakeX);

      /* ---- Category-themed arena backdrop (code grid / art palette / text paper) ---- */
      drawCategoryBackdrop(ctx, width, height, groundY, category, frame);

      /* ---- Category-driven weather particles (matrix rain / paper scraps / sparkles) ---- */
      drawWeather(ctx, width, groundY, category, frame);

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

      /* ---- Prediction side flare (soft edge glow for the predicted winner) ---- */
      if (predictionSide === "alpha" || predictionSide === "omega") {
        const flareColor = predictionSide === "alpha" ? ALPHA_COLOR : OMEGA_COLOR;
        const [fr, fg, fb] = hexToRgb(flareColor);
        const pulseF = 0.14 + Math.sin(frame * 0.08) * 0.05;
        const flareGrad = ctx.createLinearGradient(
          predictionSide === "alpha" ? 0 : width,
          0,
          predictionSide === "alpha" ? width * 0.3 : width * 0.7,
          0,
        );
        flareGrad.addColorStop(0, `rgba(${fr},${fg},${fb},${pulseF})`);
        flareGrad.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
        ctx.fillStyle = flareGrad;
        ctx.fillRect(0, 0, width, height);
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

      /* ---- Ultimate gauges (thin bar under each HP bar) ---- */
      drawUltimateGauge(
        ctx,
        alphaHPx,
        hpBarY + hpBarHeight + 3,
        hpBarWidth,
        alphaUltRef.current,
        ALPHA_COLOR,
        frame,
      );
      drawUltimateGauge(
        ctx,
        omegaHPx,
        hpBarY + hpBarHeight + 3,
        hpBarWidth,
        omegaUltRef.current,
        OMEGA_COLOR,
        frame,
      );

      /* ---- Mini portraits under HP bars — react to current state ---- */
      drawPortrait(
        ctx,
        alphaHPx + hpBarWidth + 6,
        hpBarY - 3,
        ALPHA_COLOR,
        "right",
        alphaState,
        alphaHP,
        frame,
      );
      drawPortrait(
        ctx,
        omegaHPx - 22,
        hpBarY - 3,
        OMEGA_COLOR,
        "left",
        omegaState,
        omegaHP,
        frame,
      );

      /* ---- Round timer hourglass (top-center, between HP bars) ---- */
      if (typeof roundTimerPct === "number") {
        drawHourglass(
          ctx,
          width / 2 - 6,
          hpBarY - 2,
          Math.max(0, Math.min(1, roundTimerPct)),
          frame,
        );
      }

      /* ---- Spectator emoji projectiles (spawn + render) ---- */
      if (Array.isArray(spectatorEmojis) && spectatorEmojis.length > emojiConsumedCountRef.current) {
        const fresh = spectatorEmojis.slice(emojiConsumedCountRef.current);
        for (const emo of fresh) {
          // Launch from a random edge; cross the arena behind the warriors.
          const fromLeft = Math.random() < 0.5;
          emojiProjectilesRef.current.push({
            x: fromLeft ? -12 : width + 12,
            y: 40 + Math.random() * (height - 120),
            vx: fromLeft ? 1.1 + Math.random() * 0.5 : -(1.1 + Math.random() * 0.5),
            vy: -0.1 + Math.random() * 0.2,
            emoji: emo,
            age: 0,
            maxAge: 320,
          });
        }
        emojiConsumedCountRef.current = spectatorEmojis.length;
        // Cap projectiles to avoid runaway memory
        while (emojiProjectilesRef.current.length > 14) {
          emojiProjectilesRef.current.shift();
        }
      }
      const aliveEmojis: typeof emojiProjectilesRef.current = [];
      for (const e of emojiProjectilesRef.current) {
        e.age++;
        e.x += e.vx;
        e.y += e.vy + Math.sin(e.age * 0.06) * 0.3;
        if (e.age < e.maxAge && e.x > -20 && e.x < width + 20) {
          const alpha = e.age < 20 ? e.age / 20 : e.age > e.maxAge - 40 ? (e.maxAge - e.age) / 40 : 1;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.8;
          ctx.font = "16px monospace";
          ctx.textAlign = "center";
          ctx.fillText(e.emoji, e.x, e.y);
          ctx.restore();
          aliveEmojis.push(e);
        }
      }
      emojiProjectilesRef.current = aliveEmojis;

      /* ---- Spectator chat rain — short messages drift across the upper band ---- */
      if (Array.isArray(chatMessages) && chatMessages.length > chatConsumedCountRef.current) {
        const fresh = chatMessages.slice(chatConsumedCountRef.current);
        for (const msg of fresh) {
          if (!msg || typeof msg !== "string") continue;
          const trimmed = msg.length > 32 ? msg.slice(0, 31) + "…" : msg;
          chatProjectilesRef.current.push({
            x: width + 20,
            y: 32 + Math.random() * (groundY - 110),
            vx: -(0.6 + Math.random() * 0.4),
            text: trimmed,
            age: 0,
            maxAge: 520,
          });
        }
        chatConsumedCountRef.current = chatMessages.length;
        while (chatProjectilesRef.current.length > 8) {
          chatProjectilesRef.current.shift();
        }
      }
      const aliveChats: typeof chatProjectilesRef.current = [];
      for (const msg of chatProjectilesRef.current) {
        msg.age++;
        msg.x += msg.vx;
        if (msg.age < msg.maxAge && msg.x > -200) {
          const fade =
            msg.age < 20
              ? msg.age / 20
              : msg.age > msg.maxAge - 40
                ? (msg.maxAge - msg.age) / 40
                : 1;
          const alpha = Math.max(0, Math.min(1, fade)) * 0.6;
          ctx.save();
          ctx.globalAlpha = alpha;
          // Pixel speech bubble
          ctx.font = "bold 9px monospace";
          const w = ctx.measureText(msg.text).width + 8;
          ctx.fillStyle = "rgba(10,10,25,0.85)";
          ctx.fillRect(msg.x, msg.y - 8, w, 12);
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 1;
          ctx.strokeRect(msg.x + 0.5, msg.y - 7.5, w - 1, 11);
          // Tail
          ctx.fillStyle = "rgba(10,10,25,0.85)";
          ctx.fillRect(msg.x + 6, msg.y + 4, 3, 2);
          ctx.fillRect(msg.x + 7, msg.y + 6, 2, 1);
          // Text
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.textAlign = "left";
          ctx.fillText(msg.text, msg.x + 4, msg.y + 1);
          ctx.restore();
          aliveChats.push(msg);
        }
      }
      chatProjectilesRef.current = aliveChats;

      /* ---- Walk-on intro: both sprites slide in from the edges over INTRO_DURATION frames ---- */
      introFrameRef.current = Math.min(INTRO_DURATION, introFrameRef.current + 1);
      const introT = introFrameRef.current / INTRO_DURATION;
      // Ease-out so arrivals decelerate into their final spots.
      const introEase = 1 - Math.pow(1 - introT, 3);
      const alphaIntroX = alphaBaseX - (1 - introEase) * alphaBaseX - 20 * p * (1 - introEase);
      const omegaIntroX = omegaBaseX + (1 - introEase) * (width - omegaBaseX) + 20 * p * (1 - introEase);

      /* ---- Draw afterimages left behind by dodges ---- */
      const aliveImages: typeof afterimagesRef.current = [];
      for (const im of afterimagesRef.current) {
        im.age++;
        if (im.age < im.maxAge) {
          const alpha = (1 - im.age / im.maxAge) * 0.5;
          ctx.save();
          ctx.globalAlpha = alpha;
          const spriteW = im.sprite[0].length;
          const spriteH = im.sprite.length;
          const drawX = im.x - (spriteW * p) / 2;
          const drawY = im.y - (spriteH * p) / 2 + 4 * p;
          if (im.facing === "left") {
            ctx.translate(im.x, 0);
            ctx.scale(-1, 1);
            ctx.translate(-im.x, 0);
          }
          const [cr, cg, cb] = hexToRgb(im.color);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
          for (let row = 0; row < spriteH; row++) {
            for (let col = 0; col < spriteW; col++) {
              if (im.sprite[row][col] === 0) continue;
              ctx.fillRect(drawX + col * p, drawY + row * p, p, p);
            }
          }
          ctx.restore();
          aliveImages.push(im);
        }
      }
      afterimagesRef.current = aliveImages;

      /* ---- Draw Warriors ---- */
      drawWarrior(
        ctx,
        alphaIntroX,
        warriorBaseY,
        ALPHA_COLOR,
        "right",
        alphaState,
        frame,
        alphaAnimRef.current,
        p,
        omegaIntroX,
        alphaHP,
        alphaCategory,
      );

      drawWarrior(
        ctx,
        omegaIntroX,
        warriorBaseY,
        OMEGA_COLOR,
        "left",
        omegaState,
        frame,
        omegaAnimRef.current,
        p,
        alphaIntroX,
        omegaHP,
        omegaCategory,
      );

      /* ---- INTRO banner: fire "FIGHT!" once when the walk-on finishes ---- */
      if (
        introFrameRef.current === INTRO_DURATION &&
        !didShowFightRef.current
      ) {
        didShowFightRef.current = true;
        floatingTextsRef.current.push({
          x: width / 2,
          y: warriorBaseY - 14 * p,
          text: "FIGHT!",
          color: GOLD_COLOR,
          life: 55,
          maxLife: 55,
          scale: 2.5,
        });
        spawnParticles(width / 2, warriorBaseY - 6 * p, 10, "spark", GOLD_COLOR);
      }

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
      alphaCategory,
      omegaCategory,
      roundTimerPct,
      predictionSide,
      spectatorEmojis,
      chatMessages,
      tournamentRound,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;

    // During a KO freeze frame we only advance the game clock on 1 of every 3
    // RAF ticks — produces a "bullet-time" slowdown instead of a hard pause.
    let freezeCounter = 0;
    function animate() {
      const inFreeze = frameRef.current < freezeUntilRef.current;
      if (inFreeze) {
        freezeCounter = (freezeCounter + 1) % 3;
        if (freezeCounter === 0) frameRef.current++;
      } else {
        frameRef.current++;
      }
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
  /** Agent category (code/art/text/music/research) — drives tool overlay. */
  agentCategory?: BattleCategory,
) {
  const dark = darken(color, 40);
  const dir = facing === "right" ? 1 : -1;
  const elapsed = frame - animState.startFrame;
  const lowHP = hp > 0 && hp < 30;
  const lastStand = hp > 0 && hp < 15;

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
    case "dodge": {
      const t = Math.min(1, elapsed / 20);
      // Side-step backward, bounce, then return. Ghost is drawn separately.
      offsetX = -dir * 22 * p * Math.sin(t * Math.PI);
      offsetY = -6 * p * Math.sin(t * Math.PI * 2);
      scaleX = 1 - 0.08 * Math.sin(t * Math.PI);
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

  /* ---- Last Stand (RAGE) aura — pulsing fire-red halo when HP<15 ---- */
  if (lastStand && state !== "defeat") {
    const pulse = 0.35 + 0.25 * Math.sin(frame * 0.22);
    const radius = spriteW * p * (0.65 + 0.08 * Math.sin(frame * 0.18));
    const grad = ctx.createRadialGradient(
      bx,
      by + 4 * p,
      radius * 0.3,
      bx,
      by + 4 * p,
      radius,
    );
    grad.addColorStop(0, `rgba(255,90,40,${pulse * 0.8})`);
    grad.addColorStop(0.5, `rgba(255,160,40,${pulse * 0.5})`);
    grad.addColorStop(1, "rgba(255,200,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by + 4 * p, radius, 0, Math.PI * 2);
    ctx.fill();
    // Ember particles — not spawned here (would need spawnParticles), just
    // draw a few drifting pixel embers locked to the aura.
    for (let i = 0; i < 5; i++) {
      const ang = frame * 0.08 + (i * Math.PI * 2) / 5;
      const r = radius * 0.72 + Math.sin(frame * 0.15 + i) * 2;
      ctx.fillStyle = i % 2 === 0 ? "#FFC040" : "#FF6020";
      ctx.fillRect(
        bx + Math.cos(ang) * r - 1,
        by + 4 * p + Math.sin(ang) * r - 1,
        2,
        2,
      );
    }
    // RAGE label floats above on peak pulses (every 60 frames).
    if (frame % 60 === 0) {
      ctx.save();
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText("RAGE", bx + 1, by - 10 * p + 1);
      ctx.fillStyle = "#FFB040";
      ctx.fillText("RAGE", bx, by - 10 * p);
      ctx.restore();
    }
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

  // Attack effect — category-driven weapon variant
  if (state === "attack") {
    const t = Math.min(1, elapsed / 25);
    if (t > 0.25 && t < 0.85) {
      drawWeaponAttack(ctx, bx, drawY + 4 * p, p, facing, t, color, agentCategory);
    }
  }

  /* ---- Category tool overlay — tiny weapon/prop drawn above the sprite.
         (Drawn before restore so it benefits from the mirror transform for
         left-facing omega.) ------------------------------------------------- */
  drawCategoryTool(ctx, bx, by, p, color, agentCategory, state, elapsed);

  ctx.restore();
}

/**
 * Draw a small pixel tool floating above the warrior based on category.
 * These are flavor overlays — they don't affect collision or HP.
 */
function drawCategoryTool(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  p: number,
  color: string,
  category: BattleCategory | undefined,
  state: WarriorState,
  elapsed: number,
) {
  if (!category) return;
  const lc = String(category).toLowerCase();
  // Tool hovers above the sprite, bobs with the sprite, swings forward on attack.
  const hover = Math.sin(elapsed * 0.08) * 1;
  const swing = state === "attack" && elapsed < 25 ? Math.sin((elapsed / 25) * Math.PI) * 4 : 0;
  const tx = bx - 4 * p;
  const ty = by - 14 * p + hover - swing;
  const dark = darken(color, 40);

  if (lc.includes("code") || lc.includes("dev")) {
    // KEYBOARD — 8x3 block of tiny keys
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(tx, ty, 8 * p, 3 * p);
    ctx.fillStyle = "#a0a0c0";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(tx + 1 + i * 2 * p, ty + 1, p, p);
      ctx.fillRect(tx + 1 + i * 2 * p, ty + 1 + p, p, p);
    }
    // Blinking cursor glyph on top
    if (Math.floor(elapsed / 15) % 2 === 0) {
      ctx.fillStyle = color;
      ctx.fillRect(tx + 3 * p, ty - 2, p, 2);
    }
  } else if (lc.includes("art") || lc.includes("image") || lc.includes("design")) {
    // BRUSH — diagonal pixel brush
    const palette = ["#FF6B9D", "#FFC857", "#4ECDC4", "#B983FF"];
    // Handle
    ctx.fillStyle = dark;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(tx + i * p, ty + i * p, p, p);
    }
    // Bristles
    ctx.fillStyle = palette[Math.floor(elapsed / 20) % palette.length];
    ctx.fillRect(tx + 5 * p, ty + 5 * p, 2 * p, p);
    ctx.fillRect(tx + 6 * p, ty + 5 * p + p, 2 * p, p);
  } else if (lc.includes("text") || lc.includes("writ") || lc.includes("story")) {
    // PEN — feather quill
    ctx.fillStyle = "#e8e0c0";
    // Quill shaft
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(tx + i * p, ty + 5 - i, p, p);
    }
    // Feather barbs
    ctx.fillStyle = "#fff8d8";
    ctx.fillRect(tx - p, ty + 4, p, p);
    ctx.fillRect(tx - 2, ty + 5, p, p);
    // Inky tip
    ctx.fillStyle = "#121225";
    ctx.fillRect(tx + 6 * p, ty - 1, p, p);
  } else if (lc.includes("music") || lc.includes("audio") || lc.includes("sound")) {
    // NOTE — eighth note glyph + vibrating halo
    ctx.fillStyle = color;
    // Note head
    ctx.fillRect(tx, ty + 4, 3 * p, 2 * p);
    // Stem
    ctx.fillRect(tx + 2 * p, ty - 2 * p, p, 6 * p);
    // Flag
    ctx.fillRect(tx + 3 * p, ty - 2 * p, 2 * p, p);
    ctx.fillRect(tx + 4 * p, ty - p, p, 2 * p);
    // Pulsing halo pixel
    if (Math.floor(elapsed / 8) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(tx + 6 * p, ty - 3 * p, p, p);
    }
  } else if (lc.includes("research") || lc.includes("science") || lc.includes("data")) {
    // ATOM — small orbiting electrons around a nucleus pixel
    const cx = tx + 3 * p;
    const cy = ty + 2 * p;
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy, p, p);
    // Two orbiting electrons
    for (let i = 0; i < 2; i++) {
      const ang = elapsed * 0.12 + i * Math.PI;
      const ox = Math.cos(ang) * 4 * p;
      const oy = Math.sin(ang) * 2 * p;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx + ox, cy + oy, p, p);
    }
  }
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

/* ================================================================== */
/*  HUD: ultimate gauge, mini portrait, round timer hourglass          */
/* ================================================================== */

/**
 * Thin glowing bar beneath the HP bar. Fills 0-100. When full, shimmers
 * gold + pulses to telegraph readiness.
 */
function drawUltimateGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  ult: number,
  color: string,
  frame: number,
) {
  const h = 3;
  // Background track
  ctx.fillStyle = "#14142a";
  ctx.fillRect(x, y, w, h);
  const fillW = Math.max(0, Math.min(1, ult / 100)) * (w - 2);
  const ready = ult >= 100;
  if (ready) {
    // Shimmer — alternate gold + agent color every 8 frames
    const shimmer = Math.floor(frame / 6) % 2 === 0;
    ctx.fillStyle = shimmer ? "#FFE342" : color;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Tiny "ULT" marker glyphs
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + w - 12, y - 3, 10, 2);
    ctx.fillStyle = "#FFE342";
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "left";
    ctx.fillText("ULT", x + w - 11, y - 1);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, fillW, h - 2);
  }
  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/**
 * Small pixel face below the HP bar — squared-off 22x18 portrait whose
 * expression changes with state. Quick at-a-glance reaction feedback.
 */
function drawPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing: "left" | "right",
  state: WarriorState,
  hp: number,
  frame: number,
) {
  const w = 18;
  const h = 16;
  // Background
  ctx.fillStyle = "#0e0e22";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Face
  const dark = darken(color, 35);
  const faceX = x + 3;
  const faceY = y + 3;
  // Head block
  ctx.fillStyle = color;
  ctx.fillRect(faceX, faceY, 12, 10);
  ctx.fillStyle = dark;
  ctx.fillRect(faceX, faceY + 9, 12, 2);

  // Eyes — state-driven
  const eyeY = faceY + 3;
  const eyeLX = faceX + 3;
  const eyeRX = faceX + 8;
  let eyeShape: "normal" | "angry" | "closed" | "spiral" | "wide" | "squint" = "normal";
  if (state === "attack") eyeShape = "angry";
  else if (state === "hit") eyeShape = "squint";
  else if (state === "defeat") eyeShape = "spiral";
  else if (state === "victory") eyeShape = "wide";
  else if (state === "dodge") eyeShape = "wide";
  else if (hp < 20 && hp > 0 && Math.floor(frame / 30) % 2 === 0) eyeShape = "closed";

  function drawEye(ex: number) {
    ctx.fillStyle = "#ffffff";
    if (eyeShape === "normal") {
      ctx.fillRect(ex, eyeY, 2, 2);
    } else if (eyeShape === "angry") {
      // / \ diagonals
      ctx.fillRect(ex, eyeY + 1, 2, 1);
      ctx.fillStyle = dark;
      ctx.fillRect(ex, eyeY, 1, 1);
    } else if (eyeShape === "closed" || eyeShape === "squint") {
      ctx.fillStyle = "#000";
      ctx.fillRect(ex, eyeY + 1, 2, 1);
    } else if (eyeShape === "spiral") {
      // X marks the spot
      ctx.fillStyle = "#000";
      ctx.fillRect(ex, eyeY, 1, 1);
      ctx.fillRect(ex + 1, eyeY + 1, 1, 1);
      ctx.fillRect(ex, eyeY + 2, 1, 1);
    } else if (eyeShape === "wide") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ex - 1, eyeY, 3, 3);
      ctx.fillStyle = "#000";
      ctx.fillRect(ex, eyeY + 1, 1, 1);
    }
  }
  drawEye(eyeLX);
  drawEye(eyeRX);

  // Mouth — state-driven
  const mouthY = faceY + 7;
  const mouthX = faceX + 4;
  ctx.fillStyle = "#000";
  if (state === "attack" || state === "victory") {
    // Open mouth (battle cry / shout)
    ctx.fillRect(mouthX, mouthY, 4, 2);
  } else if (state === "hit" || state === "defeat") {
    // Flat line
    ctx.fillRect(mouthX, mouthY + 1, 4, 1);
  } else if (state === "dodge") {
    // Smirk — right side up
    ctx.fillRect(mouthX + 2, mouthY, 2, 1);
    ctx.fillRect(mouthX, mouthY + 1, 2, 1);
  } else if (hp < 20 && hp > 0) {
    // Frown
    ctx.fillRect(mouthX, mouthY, 4, 1);
  } else {
    // Neutral line
    ctx.fillRect(mouthX, mouthY + 1, 3, 1);
  }

  // Facing arrow above portrait
  ctx.fillStyle = color;
  if (facing === "right") {
    ctx.fillRect(x + w - 4, y - 3, 3, 1);
    ctx.fillRect(x + w - 3, y - 2, 2, 1);
    ctx.fillRect(x + w - 2, y - 1, 1, 1);
  } else {
    ctx.fillRect(x + 1, y - 3, 3, 1);
    ctx.fillRect(x + 1, y - 2, 2, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
}

/** Pixel hourglass that empties as pct → 1. Small top-center HUD element. */
function drawHourglass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pct: number,
  frame: number,
) {
  const w = 12;
  const h = 16;
  const remaining = 1 - pct;

  // Frame (two horizontal bars + vertical edges)
  ctx.fillStyle = "#FFE342";
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);

  // Internal triangles (inverted top, point-up bottom)
  ctx.fillStyle = "#1a1a2e";
  for (let i = 0; i < h / 2; i++) {
    const inset = i;
    ctx.fillRect(x + 1 + inset, y + 1 + i, w - 2 - inset * 2, 1);
  }
  for (let i = 0; i < h / 2; i++) {
    const inset = (h / 2 - 1) - i;
    ctx.fillRect(x + 1 + inset, y + h / 2 + i, w - 2 - inset * 2, 1);
  }

  // Sand in top triangle — shrinks as time passes
  const topSandHeight = Math.round((h / 2 - 2) * remaining);
  ctx.fillStyle = "#FFD060";
  for (let i = 0; i < topSandHeight; i++) {
    const inset = i + 1;
    ctx.fillRect(x + 1 + inset, y + 1 + i, w - 2 - inset * 2, 1);
  }
  // Sand in bottom triangle — grows as time passes
  const botSandHeight = Math.round((h / 2 - 2) * pct);
  for (let i = 0; i < botSandHeight; i++) {
    const row = h - 3 - i;
    const inset = i;
    ctx.fillRect(x + 1 + inset, y + row, w - 2 - inset * 2, 1);
  }

  // Falling sand pixel mid-hourglass
  if (pct > 0 && pct < 1 && frame % 4 !== 0) {
    ctx.fillStyle = "#FFD060";
    ctx.fillRect(x + w / 2, y + h / 2 - 1 + ((frame % 3)), 1, 1);
  }
}

/* ================================================================== */
/*  Weapon variants, sky, weather                                      */
/* ================================================================== */

/**
 * Category-keyed attack visuals. Each is a pure pixel-art rendering of
 * the weapon animation at normalized progress `t` (0.25 .. 0.85).
 *
 *   code     → flying binary glyphs (0/1)
 *   art      → paint splat trail
 *   text     → ink droplet stream
 *   music    → soundwave concentric rings
 *   research → orbital particle orbs
 *   default  → the classic pixel laser beam
 */
function drawWeaponAttack(
  ctx: CanvasRenderingContext2D,
  bx: number,
  beamY: number,
  p: number,
  facing: "left" | "right",
  t: number,
  color: string,
  agentCategory: BattleCategory | undefined,
) {
  const dir = facing === "right" ? 1 : -1;
  const origin = bx + dir * 6 * p;
  const reach = 36 * p;
  const progress = (t - 0.25) / 0.6; // 0..1
  const accent = "#ffffff";
  const lc = agentCategory ? String(agentCategory).toLowerCase() : "";

  if (lc.includes("code") || lc.includes("dev")) {
    // Binary glyphs flying forward
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    for (let i = 0; i < 6; i++) {
      const gt = Math.min(1, progress + i * 0.08);
      if (gt < 0) continue;
      const gx = origin + dir * reach * gt;
      const gy = beamY + Math.sin(gt * Math.PI * 2 + i) * 3;
      const glyph = (i + Math.floor(t * 10)) % 2 === 0 ? "1" : "0";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(glyph, gx + 1, gy + 1);
      ctx.fillStyle = i % 2 === 0 ? color : "#7cff7c";
      ctx.fillText(glyph, gx, gy);
    }
    return;
  }

  if (lc.includes("art") || lc.includes("image") || lc.includes("design")) {
    // Paint splat — growing blob with colored droplets
    const palette = ["#FF6B9D", "#FFC857", "#4ECDC4", "#B983FF", color];
    for (let i = 0; i < 7; i++) {
      const gt = Math.min(1, progress + i * 0.06);
      if (gt < 0) continue;
      const gx = origin + dir * reach * gt;
      const offsetY = Math.sin(i * 1.3) * 4 + Math.cos(gt * Math.PI) * 2;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(gx - 2, beamY + offsetY - 1, 3, 3);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(gx - 1, beamY + offsetY - 1, 1, 1);
    }
    return;
  }

  if (lc.includes("text") || lc.includes("writ") || lc.includes("story")) {
    // Ink trail with drips
    for (let i = 0; i < 8; i++) {
      const gt = Math.min(1, progress + i * 0.05);
      if (gt < 0) continue;
      const gx = origin + dir * reach * gt;
      const gy = beamY + Math.sin(gt * Math.PI) * 2;
      ctx.fillStyle = i % 3 === 0 ? "#0d0d1a" : color;
      ctx.fillRect(gx - 1, gy, 2, 2);
      // Drip
      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(15,15,30,0.6)";
        ctx.fillRect(gx, gy + 3, 1, 2);
      }
    }
    return;
  }

  if (lc.includes("music") || lc.includes("audio") || lc.includes("sound")) {
    // Concentric soundwave rings expanding outward
    for (let i = 0; i < 3; i++) {
      const ringT = (progress - i * 0.18);
      if (ringT < 0 || ringT > 1) continue;
      const radius = 6 * p + ringT * reach * 0.6;
      const alpha = (1 - ringT) * 0.9;
      const [cr, cg, cb] = hexToRgb(color);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(origin, beamY, radius, facing === "right" ? -Math.PI / 2 : Math.PI / 2, facing === "right" ? Math.PI / 2 : Math.PI * 1.5);
      ctx.stroke();
    }
    return;
  }

  if (lc.includes("research") || lc.includes("science") || lc.includes("data")) {
    // Orbital particle cluster traveling forward
    const cx = origin + dir * reach * progress;
    ctx.fillStyle = color;
    ctx.fillRect(cx - 1, beamY - 1, 2, 2);
    for (let i = 0; i < 3; i++) {
      const ang = t * 10 + (i * Math.PI * 2) / 3;
      const r = 3 + Math.sin(t * 8) * 1.5;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx + Math.cos(ang) * r * p, beamY + Math.sin(ang) * r * p, 1, 1);
    }
    return;
  }

  // Default: classic pixel laser beam
  const beamLen = reach * Math.min(1, (t - 0.3) / 0.4);
  ctx.fillStyle = color;
  ctx.fillRect(facing === "right" ? origin : origin - beamLen, beamY, beamLen, p);
  ctx.fillStyle = accent;
  ctx.fillRect(facing === "right" ? origin + beamLen : origin - beamLen - p, beamY, 2 * p, p);
}

/**
 * Day / dusk / night sky gradient based on tournamentRound.
 *   1 → day (cool blues)
 *   2 → dusk (purples + orange horizon)
 *   3 → night (deep blue + moon + extra stars)
 * Drawn at the very back, only fills the sky region above the ground.
 */
function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  groundY: number,
  round: number | undefined,
  frame: number,
) {
  if (!round || round < 1) return; // default canvas background already handles this
  let topColor: string;
  let midColor: string;
  let botColor: string;
  if (round === 1) {
    topColor = "#1a2a4a";
    midColor = "#2a3f68";
    botColor = "#3a5680";
  } else if (round === 2) {
    topColor = "#2c1a40";
    midColor = "#6a2a55";
    botColor = "#d06a44";
  } else {
    topColor = "#050518";
    midColor = "#0c1030";
    botColor = "#181a40";
  }
  const grad = ctx.createLinearGradient(0, 0, 0, groundY);
  grad.addColorStop(0, topColor);
  grad.addColorStop(0.6, midColor);
  grad.addColorStop(1, botColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, groundY);

  if (round >= 3) {
    // Moon at upper right
    const mx = width - 48;
    const my = 32;
    ctx.fillStyle = "#e0d8c0";
    ctx.beginPath();
    ctx.arc(mx, my, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c1030";
    ctx.beginPath();
    ctx.arc(mx - 4, my - 2, 9, 0, Math.PI * 2);
    ctx.fill();
    // Extra twinkling stars
    for (let i = 0; i < 25; i++) {
      const sx = ((i * 71) % width);
      const sy = ((i * 31) % (groundY - 80));
      const twinkle = Math.floor((frame + i * 13) / 10) % 4 === 0 ? 2 : 1;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + (twinkle - 1) * 0.4})`;
      ctx.fillRect(sx, sy + 5, twinkle, twinkle);
    }
  } else if (round === 2) {
    // Setting sun at the horizon
    ctx.fillStyle = "#ffb870";
    ctx.beginPath();
    ctx.arc(width * 0.7, groundY - 18, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,140,80,0.4)";
    ctx.fillRect(width * 0.2, groundY - 4, width * 0.6, 2);
  }
}

/**
 * Category weather particles — persistent ambient streams that reinforce
 * the arena theme. Lightweight procedural render (no particle system).
 */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  width: number,
  groundY: number,
  category: BattleCategory | undefined,
  frame: number,
) {
  if (!category) return;
  const lc = String(category).toLowerCase();

  if (lc.includes("code") || lc.includes("dev")) {
    // Green matrix rain — vertical trails of 0s and 1s
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    for (let col = 0; col < 18; col++) {
      const x = 20 + col * (width / 20);
      const base = (frame * 2 + col * 73) % (groundY + 80);
      for (let k = 0; k < 6; k++) {
        const y = base - k * 12;
        if (y < 0 || y > groundY) continue;
        const alpha = (1 - k / 6) * 0.3;
        ctx.fillStyle = `rgba(110,255,150,${alpha})`;
        ctx.fillText((col + k) % 2 === 0 ? "1" : "0", x, y);
      }
    }
    return;
  }

  if (lc.includes("art") || lc.includes("image") || lc.includes("design")) {
    // Drifting pastel sparkles
    const palette = ["#FF6B9D", "#FFC857", "#4ECDC4", "#B983FF", "#FF9A76"];
    for (let i = 0; i < 14; i++) {
      const drift = (frame * 0.4 + i * 37) % (width + 40);
      const x = drift - 20;
      const y = ((i * 23 + frame * 0.2) % (groundY - 40)) + 10;
      const col = palette[i % palette.length];
      const [pr, pg, pb] = hexToRgb(col);
      const a = 0.3 + Math.sin(frame * 0.05 + i) * 0.2;
      ctx.fillStyle = `rgba(${pr},${pg},${pb},${a})`;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(x, y, 1, 1);
    }
    return;
  }

  if (lc.includes("text") || lc.includes("writ") || lc.includes("story")) {
    // Floating paper scraps
    for (let i = 0; i < 6; i++) {
      const drift = (frame * 0.3 + i * 79) % (width + 40);
      const x = width - drift;
      const yBase = 30 + (i * 41) % (groundY - 80);
      const y = yBase + Math.sin(frame * 0.04 + i) * 6;
      ctx.fillStyle = "rgba(245,240,210,0.3)";
      ctx.fillRect(x, y, 5, 4);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 1, y + 1, 3, 1);
      ctx.fillRect(x + 1, y + 2, 2, 1);
    }
    return;
  }

  if (lc.includes("music") || lc.includes("audio") || lc.includes("sound")) {
    // Pulsing bassline dots along the bottom
    for (let i = 0; i < 30; i++) {
      const x = (i * width) / 30;
      const bass = Math.sin(frame * 0.15 + i * 0.4);
      const radius = 1.5 + Math.max(0, bass) * 2;
      ctx.fillStyle = `rgba(180,120,255,${0.15 + bass * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, groundY - 14, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (lc.includes("research") || lc.includes("science") || lc.includes("data")) {
    // Drifting lattice dots
    ctx.fillStyle = "rgba(130,200,255,0.25)";
    for (let i = 0; i < 20; i++) {
      const x = (i * 41 + frame * 0.6) % width;
      const y = 12 + ((i * 19) % (groundY - 40));
      ctx.fillRect(x, y, 2, 2);
    }
    return;
  }
}
