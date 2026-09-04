import { useValidatorProfile } from "../../hooks/useValidatorProfile";
import { truncateMiddle } from "../../lib/format";
import { ValidatorAvatar } from "./ValidatorAvatar";

interface ValidatorIdentityProps {
  operatorAddress: string;
  displayAddress?: string;
  moniker?: string;
  identity?: string;
  size?: "sm" | "md";
  showProfileBadge?: boolean;
  className?: string;
}

export function ValidatorIdentity({ operatorAddress, displayAddress = operatorAddress, moniker, identity, size = "sm", showProfileBadge = false, className = "" }: ValidatorIdentityProps) {
  const profile = useValidatorProfile(operatorAddress);
  const displayName = profile?.nickname || moniker || truncateMiddle(displayAddress);

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <ValidatorAvatar identity={identity} imageUrl={profile?.profilePicture} moniker={displayName} size={size} />
      <div className="min-w-0">
        <div className={`flex min-w-0 items-center gap-1.5 ${size === "md" ? "text-base text-white" : ""}`}>
          <span className="min-w-0 break-words">{displayName}</span>
          {showProfileBadge && profile ? (
            <svg role="img" aria-label="Desmos Profile exists" viewBox="0 0 20 20" fill="none"
              className="h-4 w-4 shrink-0 text-sky-300">
              <title>Desmos Profile exists</title>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="m6 10 2.5 2.5L14 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
        {profile?.nickname || moniker ? (
          <div className={`mt-1 text-xs ${size === "md" ? "text-slate-400" : "text-slate-500"}`}>
            {truncateMiddle(displayAddress)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
