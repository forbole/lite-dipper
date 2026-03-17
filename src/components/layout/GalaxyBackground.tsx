import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
};

const STAR_COUNT = 48;
const CONNECTION_DISTANCE = 150;

function createStar(width: number, height: number): Star {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.28,
    vy: (Math.random() - 0.5) * 0.28,
    radius: 1 + Math.random() * 2.2,
    hue: Math.random() > 0.72 ? 46 : 197
  };
}

export function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const stars: Star[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);

      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (stars.length === 0) {
        for (let index = 0; index < STAR_COUNT; index += 1) {
          stars.push(createStar(width, height));
        }
      } else {
        for (const star of stars) {
          star.x = Math.min(Math.max(star.x, 0), width);
          star.y = Math.min(Math.max(star.y, 0), height);
        }
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      context.clearRect(0, 0, width, height);

      const glow = context.createRadialGradient(width * 0.55, height * 0.42, 0, width * 0.55, height * 0.42, width * 0.55);
      glow.addColorStop(0, "rgba(14, 165, 233, 0.08)");
      glow.addColorStop(0.45, "rgba(251, 191, 36, 0.04)");
      glow.addColorStop(1, "rgba(2, 6, 23, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const star of stars) {
        if (!mediaQuery.matches) {
          star.x += star.vx;
          star.y += star.vy;

          if (star.x <= -12 || star.x >= width + 12) {
            star.vx *= -1;
          }

          if (star.y <= -12 || star.y >= height + 12) {
            star.vy *= -1;
          }
        }
      }

      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index];

        for (let innerIndex = index + 1; innerIndex < stars.length; innerIndex += 1) {
          const target = stars[innerIndex];
          const dx = target.x - star.x;
          const dy = target.y - star.y;
          const distance = Math.hypot(dx, dy);

          if (distance > CONNECTION_DISTANCE) {
            continue;
          }

          const opacity = 1 - distance / CONNECTION_DISTANCE;
          context.strokeStyle = `rgba(148, 163, 184, ${opacity * 0.18})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(star.x, star.y);
          context.lineTo(target.x, target.y);
          context.stroke();
        }
      }

      for (const star of stars) {
        context.fillStyle = `hsla(${star.hue}, 90%, 72%, 0.9)`;
        context.beginPath();
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = `hsla(${star.hue}, 95%, 72%, 0.14)`;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * 4.5, 0, Math.PI * 2);
        context.fill();
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.08),transparent_22%),radial-gradient(circle_at_80%_24%,rgba(252,211,77,0.07),transparent_20%),radial-gradient(circle_at_50%_72%,rgba(14,165,233,0.05),transparent_28%)]" />
    </div>
  );
}
