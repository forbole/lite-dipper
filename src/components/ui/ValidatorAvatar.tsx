import { botttsNeutral } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { useState } from "react";

interface ValidatorAvatarProps {
  identity?: string;
  imageUrl?: string;
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

export function ValidatorAvatar({ identity, imageUrl, moniker, size = "md" }: ValidatorAvatarProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const className = `${SIZE_CLASS_MAP[size]} shrink-0 border border-white/10 object-cover`;
  const source = [imageUrl, identity ? buildAvatarEndpoint(identity) : undefined]
    .find((url): url is string => typeof url === "string" && url.length > 0 && !failedSources.includes(url));

  return (
    <img
      src={source || buildFallbackAvatarDataUri(identity || moniker || "?")}
      alt={`${moniker} avatar`}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (source) setFailedSources((previous) => [...previous, source]);
      }}
    />
  );
}
