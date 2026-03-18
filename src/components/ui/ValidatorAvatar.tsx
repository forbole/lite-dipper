import { botttsNeutral } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
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

function buildFallbackAvatarDataUri(seed: string): string {
  return createAvatar(botttsNeutral, {
    seed,
    backgroundType: ["solid"],
    backgroundColor: ["1e293b", "0f172a", "155e75", "1d4ed8", "854d0e"]
  }).toDataUri();
}

export function ValidatorAvatar({ identity, moniker, size = "md" }: ValidatorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const className = `${SIZE_CLASS_MAP[size]} shrink-0 border border-white/10 object-cover`;

  if (!identity || failed) {
    return (
      <img
        src={buildFallbackAvatarDataUri(identity || moniker || "?")}
        alt={`${moniker} avatar`}
        className={className}
        loading="lazy"
      />
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
