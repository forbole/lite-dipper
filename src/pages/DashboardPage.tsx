import { Link } from "react-router-dom";
import { MetricCard } from "../components/ui/MetricCard";
import { Panel } from "../components/ui/Panel";
import { DESMOS_TOKEN_ICON_URL } from "../config/chain";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatFixedDsmFromMicro, formatNumber, truncateMiddle } from "../lib/format";
import type { DashboardPayload } from "../types/desmos";

export function DashboardPage() {
  const { data, error, loading } = useApiResource<DashboardPayload>("/api/dashboard", {
    pollMs: 10_000
  });

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading latest chain data…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Latest Height" value={formatNumber(data.latestHeight)} />
        <MetricCard label="Active Validators" value={formatNumber(data.activeValidators)} />
        <MetricCard label="Bonded Delegation" value={formatFixedDsmFromMicro(data.bondedTokens)} />
        <MetricCard label="Native Token" value="DSM" iconSrc={DESMOS_TOKEN_ICON_URL} iconAlt="DSM token" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Recent Blocks" subtitle="Latest finalized blocks on Desmos">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Height</th>
                  <th className="pb-3 pr-4 font-medium">Hash</th>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Txs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.recentBlocks.map((block) => (
                  <tr key={block.hash}>
                    <td className="py-3 pr-4">
                      <Link to={`/blocks/${block.height}`} className="text-sky-200 transition hover:text-white">
                        {formatNumber(block.height)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-200">{truncateMiddle(block.hash)}</td>
                    <td className="py-3 pr-4 text-slate-300">{formatDateTime(block.time)}</td>
                    <td className="py-3 pr-4 text-slate-300">{formatNumber(block.txCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Recent Transactions" subtitle="Latest confirmed transactions">
          <div className="space-y-3">
            {data.recentTransactions.map((transaction) => (
              <Link
                key={transaction.hash}
                to={`/transactions/${transaction.hash}`}
                className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-white">{truncateMiddle(transaction.hash)}</p>
                    <p className="mt-1 text-xs text-slate-400">{transaction.messageTypes.join(", ") || "No messages"}</p>
                  </div>
                  <div className="text-sm text-slate-300">
                    H {formatNumber(transaction.height)} · {formatDateTime(transaction.timestamp)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
