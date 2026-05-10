"use client";
import { useEffect, useState } from "react";

const COLORS = [
  "#ffd86b", "#ff9f5a", "#d85e35", "#f15c38",
  "#ffd1dc", "#c084fc", "#34d399", "#fb923c",
  "#fffaf4", "#fbbf24",
];

type Piece = {
  id: number;
  x: number;
  color: string;
  w: number;
  h: number;
  duration: number;
  delay: number;
  rotate: number;
  drift: number;
  shape: "rect" | "ribbon" | "circle";
};

export function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const next: Piece[] = Array.from({ length: 90 }, (_, i) => ({
      id: i,
      x: Math.random() * 105 - 2,
      color: COLORS[i % COLORS.length],
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 14,
      duration: 2.2 + Math.random() * 2.4,
      delay: Math.random() * 2.2,
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 80,
      shape: (["rect", "ribbon", "circle"] as const)[i % 3],
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 6500);
    return () => clearTimeout(t);
  }, []);

  if (!pieces.length) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: -24,
            width: p.shape === "ribbon" ? p.w * 0.4 : p.w,
            height: p.shape === "circle" ? p.w : p.h,
            background: p.color,
            borderRadius: p.shape === "circle" ? "50%" : "1px",
            opacity: 0.92,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(.3,0,.7,1) forwards`,
            "--rotate": `${p.rotate}deg`,
            "--drift": `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
