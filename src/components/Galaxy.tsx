import { useEffect, useRef } from 'react';

interface Particle {
  r: number; // orbital radius (0..1)
  a: number; // base angle
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

interface GalaxyDef {
  cx: number; // relative center
  cy: number;
  scale: number; // radius as fraction of min(viewport)
  tilt: number; // rad
  squash: number;
  dir: 1 | -1;
  count: number;
  dim: number;
}

const CORE = [255, 241, 219];
const MID = [159, 194, 245];
const EDGE = [201, 154, 224];

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function makeParticles(def: GalaxyDef): Particle[] {
  const ARMS = 2;
  return Array.from({ length: def.count }, () => {
    const r = Math.sqrt(Math.random());
    const arm = Math.floor(Math.random() * ARMS);
    const spread = (Math.random() - 0.5) * (0.5 - 0.35 * r);
    const a = (arm * Math.PI * 2) / ARMS + r * 4.2 + spread * Math.PI;
    const t = Math.min(1, r * 1.2);
    return {
      r,
      a,
      speed: (0.05 + 0.1 / (0.35 + r)) * def.dir,
      size: Math.random() < 0.08 ? 1.8 : 1,
      alpha: (1 - r * 0.75) * (0.35 + Math.random() * 0.5) * def.dim,
      color: t < 0.45 ? mix(CORE, MID, t / 0.45) : mix(MID, EDGE, (t - 0.45) / 0.55),
    };
  });
}

/** `still`: draw one frame and stop (reduced motion). */
export default function Galaxy({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let w = 0;
    let h = 0;

    const galaxies: GalaxyDef[] = [
      { cx: 0.8, cy: 0.24, scale: 0.4, tilt: -0.5, squash: 0.5, dir: 1, count: 1500, dim: 0.9 },
      { cx: 0.12, cy: 0.8, scale: 0.16, tilt: 0.7, squash: 0.42, dir: -1, count: 450, dim: 0.55 },
    ];
    const parts = galaxies.map(makeParticles);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = still;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const time = reduced ? 0 : t * 0.001;
      galaxies.forEach((g, gi) => {
        const R = Math.min(w, h) * g.scale;
        const cx = g.cx * w;
        const cy = g.cy * h;

        // core glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
        glow.addColorStop(0, `rgba(255,241,219,${0.5 * g.dim})`);
        glow.addColorStop(0.25, `rgba(159,194,245,${0.16 * g.dim})`);
        glow.addColorStop(1, 'rgba(159,194,245,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(g.tilt);
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts[gi]) {
          const ang = p.a + time * p.speed;
          const x = Math.cos(ang) * p.r * R;
          const y = Math.sin(ang) * p.r * R * g.squash;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, p.size, p.size);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      });
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    if (reduced) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [still]);

  return <canvas ref={ref} className="galaxy-canvas" aria-hidden />;
}
