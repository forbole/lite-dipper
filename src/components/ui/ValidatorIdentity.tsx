import { useValidatorProfile } from "../../hooks/useValidatorProfile";
import { truncateMiddle } from "../../lib/format";
import { ValidatorAvatar } from "./ValidatorAvatar";

interface ValidatorIdentityProps {
  operatorAddress: string;
  displayAddress?: string;
  moniker?: string;
  identity?: string;
  size?: "sm" | "md";
  className?: string;
}

export function ValidatorIdentity({ operatorAddress, displayAddress = operatorAddress, moniker, identity, size = "sm", className = "" }: ValidatorIdentityProps) {
  const profile = useValidatorProfile(operatorAddress);
  const displayName = profile?.nickname || moniker || truncateMiddle(displayAddress);

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <ValidatorAvatar identity={identity} imageUrl={profile?.profilePicture} moniker={displayName} size={size} />
      <div className="min-w-0">
        <div className={`break-words ${size === "md" ? "text-base text-white" : ""}`}>{displayName}</div>
        {profile?.nickname || moniker ? (
          <div className={`mt-1 text-xs ${size === "md" ? "text-slate-400" : "text-slate-500"}`}>
            {truncateMiddle(displayAddress)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
