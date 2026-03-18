import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, action, children, className }: PanelProps) {
  return (
    <section
      className={[
        "overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur",
        className ?? ""
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-lg text-white">{title}</h2>
          {subtitle ? <div className="mt-1 text-sm text-slate-300">{subtitle}</div> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
