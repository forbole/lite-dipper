import { useState } from "react";

interface ValidatorAvatarProps {
  identity?: string;
  moniker: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS_MAP = {
  sm: "h-8 w-8 rounded-full text-sm",
  md: "h-10 w-10 rounded-full text-base",
  lg: "h-20 w-20 rounded-full text-3xl"
} as const;

function buildAvatarEndpoint(identity: string): string {
  return `/api/keybase/avatar/${encodeURIComponent(identity)}`;
}

export function ValidatorAvatar({ identity, moniker, size = "md" }: ValidatorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = moniker.trim().slice(0, 1).toUpperCase() || "?";
  const className = `${SIZE_CLASS_MAP[size]} shrink-0 border border-white/10 object-cover`;

  if (!identity || failed) {
    return (
      <div className={`flex items-center justify-center bg-white/[0.05] text-slate-300 ${className}`}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={buildAvatarEndpoint(identity)}
      alt={`${moniker} avatar`}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
