import { statusTone } from "../../lib/format";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusTone(status)}`}>
      {status}
    </span>
  );
}
