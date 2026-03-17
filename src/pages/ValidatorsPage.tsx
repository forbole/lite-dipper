import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { ValidatorAvatar } from "../components/ui/ValidatorAvatar";
import { useApiResource } from "../hooks/useApiResource";
import { formatBondStatus, formatDsmFromMicro, formatPercent, truncateMiddle } from "../lib/format";
import type { ValidatorSummary } from "../types/desmos";
import { useWallet } from "../wallet/WalletProvider";

export function ValidatorsPage() {
  const { connection } = useWallet();
  const { data, error, loading } = useApiResource<ValidatorSummary[]>("/api/validators", {
    pollMs: 30_000
  });

  return (
    <div className="space-y-6">
      <Panel
        title="Validators"
        subtitle="Active validator set for Desmos"
        action={
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
            {connection ? `Delegation actions enabled for ${connection.name}` : "Connect a wallet to stake"}
          </div>
        }
      >
        {loading && !data ? <p className="text-sm text-slate-300">Loading validators…</p> : null}
        {error && !data ? <p className="text-sm text-rose-200">{error}</p> : null}
        {data ? (
          <div className="space-y-3">
            {data.map((validator) => (
              <Link
                key={validator.operatorAddress}
                to={`/validators/${validator.operatorAddress}`}
                className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center gap-3">
                    <ValidatorAvatar identity={validator.identity} moniker={validator.moniker} />
                    <div>
                      <p className="text-base text-white">{validator.moniker}</p>
                      <p className="mt-1 text-xs text-slate-400">{truncateMiddle(validator.operatorAddress)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                    <StatusPill status={validator.jailed ? "Jailed" : formatBondStatus(validator.status)} />
                    <span>{formatDsmFromMicro(validator.tokens)}</span>
                    <span>{formatPercent(validator.commissionRate)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
