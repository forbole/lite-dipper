import { useState } from "react";

function JsonNode({ value, label, index, last = true }: { value: unknown; label?: string; index?: number; last?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const prefix = label === undefined ? "" : `${JSON.stringify(label)}: `;
  const suffix = last ? "" : ",";
  if (value === null || typeof value !== "object") {
    return (
      <div className="whitespace-pre-wrap break-all pl-4">
        <span className="text-sky-200">{prefix}</span>
        <span className={typeof value === "string" ? "text-emerald-200" : "text-amber-200"}>{JSON.stringify(value)}</span>
        {suffix}
      </div>
    );
  }

  const array = Array.isArray(value);
  const count = array ? value.length : Object.keys(value).length;
  const opening = array ? "[" : "{";
  const closing = array ? "]" : "}";
  if (count === 0) return <div className="pl-4"><span className="text-sky-200">{prefix}</span>{opening}{closing}{suffix}</div>;

  return (
    <details open={expanded} onToggle={(event) => {
      if (event.target === event.currentTarget) setExpanded(event.currentTarget.open);
    }}>
      <summary className="cursor-pointer rounded px-1 py-1 break-all hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
        {index === undefined ? null : <span className="mr-2 text-slate-500">{index}:</span>}
        <span className="text-sky-200">{prefix}</span>
        {opening}{expanded ? "" : `…${closing}${suffix}`}
        <span className="ml-2 text-slate-400">{count} {array ? (count === 1 ? "item" : "items") : (count === 1 ? "field" : "fields")}</span>
      </summary>
      {expanded ? (
        <div className="ml-4 border-l border-white/10 pl-2">
          {/* Mount only the level being inspected; collapsed descendants stay out of the DOM. */}
          {Object.entries(value).map(([key, child], index) => (
            <JsonNode key={key} value={child} label={array ? undefined : key} index={array ? index : undefined} last={index === count - 1} />
          ))}
          <div>{closing}{suffix}</div>
        </div>
      ) : null}
    </details>
  );
}

export function CollapsibleJson({ value, label }: { value: unknown; label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0}
      className="max-h-96 overflow-auto rounded-2xl border border-white/[0.08] bg-slate-950/45 p-3 font-mono text-xs leading-6 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
      <JsonNode value={value} />
    </div>
  );
}
