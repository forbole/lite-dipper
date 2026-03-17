interface MetricCardProps {
  label: string;
  value: string;
  iconSrc?: string;
  iconAlt?: string;
}

export function MetricCard({ label, value, iconSrc, iconAlt = "" }: MetricCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/55 px-5 py-4 min-w-0">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[1.9rem] leading-none text-white md:text-[2.15rem] xl:text-[2.3rem]">
          {value}
        </p>
        {iconSrc ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
            <img src={iconSrc} alt={iconAlt} className="h-full w-full object-cover" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
