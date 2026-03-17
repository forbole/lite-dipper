import { Link, useParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatNumber, truncateMiddle } from "../lib/format";
import type { BlockDetailsPayload } from "../types/desmos";

export function BlockDetailsPage() {
  const { height } = useParams();
  const { data, error, loading } = useApiResource<BlockDetailsPayload>(`/api/blocks/${height}`, {
    enabled: Boolean(height)
  });

  if (!height) {
    return <div className="text-sm text-rose-200">Missing block height.</div>;
  }

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading block…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Panel title={`Block ${formatNumber(data.block.height)}`} subtitle="CometBFT block metadata and linked transactions">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Hash</p>
            <p className="mt-2 text-white">{truncateMiddle(data.block.hash)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Time</p>
            <p className="mt-2 text-white">{formatDateTime(data.block.time)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Chain ID</p>
            <p className="mt-2 text-white">{data.block.chainId}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Transactions</p>
            <p className="mt-2 text-white">{formatNumber(data.block.txCount)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-sm text-slate-400">Proposer</p>
          <div className="mt-2 flex items-center gap-3">
            <ValidatorAvatar
              identity={data.block.proposerIdentity}
              moniker={data.block.proposerMoniker || truncateMiddle(data.block.proposerAddress)}
            />
            <div>
              <p className="text-white">{data.block.proposerMoniker || truncateMiddle(data.block.proposerAddress)}</p>
              {data.block.proposerMoniker ? (
                <p className="mt-1 text-xs text-slate-500">{truncateMiddle(data.block.proposerAddress)}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title={`Signed Validators (${formatNumber(data.signedValidators.length)})`}
        subtitle="Validators that signed the block commit, resolved from the cached validator directory"
      >
        {data.signedValidators.length === 0 ? (
          <p className="text-sm text-slate-300">No signed validator data was returned for this block.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.signedValidators.map((validator) => {
              const content = (
                <div className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 transition hover:border-sky-300/30 hover:bg-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <ValidatorAvatar identity={validator.identity} moniker={validator.moniker} />
                    <div>
                      <p className="text-sm text-white">{validator.moniker}</p>
                      <p className="mt-1 text-xs text-slate-500">{truncateMiddle(validator.consensusAddress)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{formatDateTime(validator.timestamp)}</p>
                </div>
              );

              return validator.operatorAddress ? (
                <Link key={validator.consensusAddress} to={`/validators/${validator.operatorAddress}`}>
                  {content}
                </Link>
              ) : (
                <div key={validator.consensusAddress}>{content}</div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Transactions In Block" subtitle={`Block ${formatNumber(data.block.height)} transaction set`}>
        {data.transactions.length === 0 ? (
          <p className="text-sm text-slate-300">No transactions in this block.</p>
        ) : (
          <div className="space-y-3">
            {data.transactions.map((transaction) => (
              <Link
                key={transaction.hash}
                to={`/transactions/${transaction.hash}`}
                className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
              >
                <p className="text-sm text-white">{truncateMiddle(transaction.hash)}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {transaction.messageTypes.join(", ")} · gas used {formatNumber(transaction.gasUsed || 0)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
