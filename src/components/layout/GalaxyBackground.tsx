import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  baseRadius: number;
  hue: number;
};

const STAR_COUNT = 48;
const CONNECTION_DISTANCE = 150;

function createStar(width: number, height: number): Star {
  const depth = 0.35 + Math.random() * 0.9;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.28,
    vy: (Math.random() - 0.5) * 0.28,
    depth,
    baseRadius: 0.8 + depth * 1.8,
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
      const now = performance.now();

      context.clearRect(0, 0, width, height);

      const glow = context.createRadialGradient(width * 0.55, height * 0.42, 0, width * 0.55, height * 0.42, width * 0.55);
      glow.addColorStop(0, "rgba(14, 165, 233, 0.08)");
      glow.addColorStop(0.45, "rgba(251, 191, 36, 0.04)");
      glow.addColorStop(1, "rgba(2, 6, 23, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const star of stars) {
        if (!mediaQuery.matches) {
          const speedMultiplier = 0.35 + star.depth * 0.9;
          star.x += star.vx * speedMultiplier;
          star.y += star.vy * speedMultiplier;

          if (star.x <= -12 || star.x >= width + 12) {
            star.vx *= -1;
          }

          if (star.y <= -12 || star.y >= height + 12) {
            star.vy *= -1;
          }
        }
      }

      const projectedStars = stars.map((star, index) => {
        let elasticOffsetX = 0;
        let elasticOffsetY = 0;

        for (let innerIndex = 0; innerIndex < stars.length; innerIndex += 1) {
          if (innerIndex === index) {
            continue;
          }

          const target = stars[innerIndex];
          const dx = target.x - star.x;
          const dy = target.y - star.y;
          const distance = Math.hypot(dx, dy);

          if (distance > CONNECTION_DISTANCE) {
            continue;
          }

          const closeness = 1 - distance / CONNECTION_DISTANCE;
          const phase = index * 0.61 + innerIndex * 0.37;
          const wobble = Math.sin(now * 0.006 + phase) * closeness * 2.4;
          const swirlX = Math.cos(now * 0.004 + phase * 1.3) * closeness * 1.2;
          const swirlY = Math.sin(now * 0.005 + phase * 1.1) * closeness * 1.2;
          const normalizedDx = dx / Math.max(distance, 1);
          const normalizedDy = dy / Math.max(distance, 1);

          elasticOffsetX += (-normalizedDx * wobble + swirlX) * (0.45 + star.depth * 0.75);
          elasticOffsetY += (-normalizedDy * wobble + swirlY) * (0.45 + star.depth * 0.75);
        }

        const centerX = width / 2;
        const centerY = height / 2;
        const depthPulse = mediaQuery.matches ? 0 : Math.sin(now * 0.0009 + index * 0.47) * 0.045;
        const projectionScale = 0.72 + star.depth * 0.42 + depthPulse;
        const renderX = centerX + (star.x - centerX) * projectionScale + elasticOffsetX;
        const renderY = centerY + (star.y - centerY) * projectionScale + elasticOffsetY;

        return {
          renderX,
          renderY,
          radius: star.baseRadius * (0.72 + star.depth * 0.85),
          glowRadius: star.baseRadius * (2.8 + star.depth * 2.4),
          lineOpacity: 0.08 + star.depth * 0.14,
          fillOpacity: 0.45 + star.depth * 0.5,
          glowOpacity: 0.05 + star.depth * 0.12
        };
      });

      for (let index = 0; index < stars.length; index += 1) {
        const star = projectedStars[index];

        for (let innerIndex = index + 1; innerIndex < stars.length; innerIndex += 1) {
          const target = projectedStars[innerIndex];
          const dx = target.renderX - star.renderX;
          const dy = target.renderY - star.renderY;
          const distance = Math.hypot(dx, dy);

          if (distance > CONNECTION_DISTANCE) {
            continue;
          }

          const opacity = 1 - distance / CONNECTION_DISTANCE;
          context.strokeStyle = `rgba(148, 163, 184, ${opacity * Math.min(star.lineOpacity, target.lineOpacity)})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(star.renderX, star.renderY);
          context.lineTo(target.renderX, target.renderY);
          context.stroke();
        }
      }

      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index];
        const projected = projectedStars[index];

        context.fillStyle = `hsla(${star.hue}, 90%, 72%, ${projected.fillOpacity})`;
        context.beginPath();
        context.arc(projected.renderX, projected.renderY, projected.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = `hsla(${star.hue}, 95%, 72%, ${projected.glowOpacity})`;
        context.beginPath();
        context.arc(projected.renderX, projected.renderY, projected.glowRadius, 0, Math.PI * 2);
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
