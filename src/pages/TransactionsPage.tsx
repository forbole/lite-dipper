import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatNumber, truncateMiddle } from "../lib/format";
import type { TransactionSummary } from "../types/desmos";

export function TransactionsPage() {
  const { data, error, loading } = useApiResource<TransactionSummary[]>("/api/transactions?limit=20", {
    pollMs: 15_000
  });

  return (
    <Panel title="Transactions" subtitle="Recent transactions indexed from Desmos REST">
      {loading && !data ? <p className="text-sm text-slate-300">Loading transactions…</p> : null}
      {error && !data ? <p className="text-sm text-rose-200">{error}</p> : null}
      {data ? (
        <div className="space-y-3">
          {data.map((transaction) => (
            <Link
              key={transaction.hash}
              to={`/transactions/${transaction.hash}`}
              className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-white">{truncateMiddle(transaction.hash)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {transaction.messageTypes.join(", ") || "No messages"} · from {truncateMiddle(transaction.sender)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <StatusPill status={transaction.success ? "Success" : "Failed"} />
                  <span>H {formatNumber(transaction.height)}</span>
                  <span>{formatDateTime(transaction.timestamp)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
