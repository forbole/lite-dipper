import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatNumber, truncateMiddle } from "../lib/format";
import type { BlockSummary } from "../types/desmos";

export function BlocksPage() {
  const { data, error, loading } = useApiResource<BlockSummary[]>("/api/blocks?limit=20", {
    pollMs: 15_000
  });

  return (
    <Panel title="Blocks" subtitle="Recent blocks fetched from Desmos RPC">
      {loading && !data ? <p className="text-sm text-slate-300">Loading blocks…</p> : null}
      {error && !data ? <p className="text-sm text-rose-200">{error}</p> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="pb-3 pr-4 font-medium">Height</th>
                <th className="pb-3 pr-4 font-medium">Hash</th>
                <th className="pb-3 pr-4 font-medium">Time</th>
                <th className="pb-3 pr-4 font-medium">Proposer</th>
                <th className="pb-3 pr-4 font-medium">Tx Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.map((block) => (
                <tr key={block.hash}>
                  <td className="py-3 pr-4">
                    <Link to={`/blocks/${block.height}`} className="text-sky-200 transition hover:text-white">
                      {formatNumber(block.height)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-slate-200">{truncateMiddle(block.hash)}</td>
                  <td className="py-3 pr-4 text-slate-300">{formatDateTime(block.time)}</td>
                  <td className="py-3 pr-4 text-slate-300">
                    <div className="flex items-center gap-3">
                      <ValidatorAvatar
                        identity={block.proposerIdentity}
                        moniker={block.proposerMoniker || truncateMiddle(block.proposerAddress)}
                        size="sm"
                      />
                      <div>
                        <div>{block.proposerMoniker || truncateMiddle(block.proposerAddress)}</div>
                        {block.proposerMoniker ? (
                          <div className="mt-1 text-xs text-slate-500">{truncateMiddle(block.proposerAddress)}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">{formatNumber(block.txCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
