import { useState } from "react";

interface CopyIconButtonProps {
  value: string;
  className?: string;
}

export function CopyIconButton({ value, className }: CopyIconButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 2_000);
  }

  const iconName = copyState === "copied" ? "check" : copyState === "error" ? "error" : "content_copy";
  const label = copyState === "copied" ? "Address copied" : copyState === "error" ? "Copy failed" : "Copy address";

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10",
        className ?? ""
      ].join(" ")}
    >
      <span className="material-symbols-rounded text-[18px] leading-none">{iconName}</span>
    </button>
  );
}
