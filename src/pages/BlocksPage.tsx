import { Link, useLocation } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { ValidatorIdentity } from "../components/ui/ValidatorIdentity";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatNumber, truncateMiddle } from "../lib/format";
import type { BlockSummary } from "../types/desmos";
import { resolvePage } from "../seo/page";

export function BlocksPage() {
  const location = useLocation();
  const route = resolvePage(location.pathname + location.search);
  const { data, error, loading } = useApiResource<BlockSummary[]>(route.key, {
    pollMs: route.before ? 0 : 15_000
  });

  return (
    <Panel title="Blocks" subtitle={route.before ? `Blocks before height ${formatNumber(route.before)}` : "Recent blocks fetched from Desmos RPC"}>
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
                    <ValidatorIdentity
                      operatorAddress={block.proposerOperatorAddress ?? ""}
                      displayAddress={block.proposerAddress}
                      identity={block.proposerIdentity}
                      moniker={block.proposerMoniker}
                    />
                  </td>
                  <td className="py-3 pr-4 text-slate-300">{formatNumber(block.txCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <nav aria-label="Block pagination" className="mt-5 flex justify-between text-sm text-sky-200">
        {route.before ? <Link to="/blocks" className="hover:text-white">Latest blocks</Link> : <span />}
        {data?.length && data.at(-1)!.height > 1 ? (
          <Link to={`/blocks?before=${data.at(-1)!.height}`} className="hover:text-white">Older blocks →</Link>
        ) : null}
      </nav>
    </Panel>
  );
}
