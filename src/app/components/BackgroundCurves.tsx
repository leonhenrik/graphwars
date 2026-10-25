import { useState } from 'react';

const WIDTH = 1000;
const HEIGHT = 600;
const SAMPLES = 240;
const COLORS = ['#38bdf8', '#a78bfa', '#fb923c'];
const TWO_PI = Math.PI * 2;

interface Params {
  a1: number;
  f1: number;
  p1: number;
  f2: number;
  p2: number;
  a2: number;
  f3: number;
  p3: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomParams(): Params {
  return {
    a1: rand(40, 140),
    f1: rand(1, 4),
    p1: rand(0, TWO_PI),
    f2: rand(0.8, 3),
    p2: rand(0, TWO_PI),
    a2: rand(20, 80),
    f3: rand(3, 10),
    p3: rand(0, TWO_PI),
  };
}

/** Nudges every parameter a little, so keyframes morph gently instead of jumping. */
function drift(p: Params, amount: number): Params {
  const scale = (v: number) => v * (1 + rand(-amount, amount));
  return {
    a1: scale(p.a1),
    f1: scale(p.f1),
    p1: p.p1 + rand(-amount, amount) * TWO_PI,
    f2: scale(p.f2),
    p2: p.p2 + rand(-amount, amount) * TWO_PI,
    a2: scale(p.a2),
    f3: scale(p.f3),
    p3: p.p3 + rand(-amount, amount) * TWO_PI,
  };
}

function buildPath(p: Params): string {
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = -2 + (4 * i) / SAMPLES;
    const y = p.a1 * Math.sin(p.f1 * x + p.p1) * Math.cos(p.f2 * x + p.p2) + p.a2 * Math.sin(p.f3 * x + p.p3);
    const px = ((x + 2) / 4) * WIDTH;
    const py = HEIGHT / 2 - y;
    points.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return points.join(' ');
}

interface Curve {
  color: string;
  seconds: number;
  dashSeconds: number;
  frames: string[];
}

function makeCurves(): Curve[] {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const count = 5;
  return Array.from({ length: count }, (_, i) => {
    const base = randomParams();
    const frames = [base, drift(base, 0.25), drift(base, 0.25), base].map(buildPath);
    return {
      color: COLORS[i % COLORS.length] ?? '#38bdf8',
      seconds: reduced ? 0 : rand(50, 90),
      dashSeconds: rand(50, 110),
      frames,
    };
  });
}

/** Slowly flowing, slowly reshaping dashed function plots behind the lobby content. Purely decorative. */
export function BackgroundCurves() {
  const [curves] = useState(makeCurves);
  return (
    <svg className="bg-curves" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {curves.map((curve, i) => (
        <path
          key={i}
          d={curve.frames[0]}
          stroke={curve.color}
          style={{ animationDuration: `${curve.dashSeconds}s` }}
        >
          {curve.seconds > 0 && (
            <animate
              attributeName="d"
              values={curve.frames.join(';')}
              dur={`${curve.seconds}s`}
              repeatCount="indefinite"
            />
          )}
        </path>
      ))}
    </svg>
  );
}
