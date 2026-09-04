import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { ValidatorIdentity } from "../components/ui/ValidatorIdentity";
import { useApiResource } from "../hooks/useApiResource";
import { formatDsmFromMicro, formatPercent } from "../lib/format";
import type { ValidatorSummary } from "../types/desmos";
import { useWallet } from "../wallet/context";
import { resolvePage } from "../seo/page";
import { validatorListPath, validatorPage, VALIDATORS_PER_PAGE } from "../lib/validatorPagination";

export function ValidatorsPage() {
  const { connection } = useWallet();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const route = resolvePage(location.pathname + location.search);
  const inactive = route.validatorStatus === "inactive";
  const page = route.validatorPage ?? 1;
  const { data, error, loading, refresh } = useApiResource<ValidatorSummary[]>(route.key, {
    pollMs: 30_000
  });
  const visibleValidators = data ? validatorPage(data, page) : [];

  return (
    <div className="space-y-6">
      <Panel
        title="Validators"
        subtitle={inactive ? "Jailed and inactive validators on Desmos" : "Active validator set for Desmos"}
        action={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span>Show</span>
              <select aria-label="Validator status" value={inactive ? "inactive" : "active"}
                onChange={(event) => setSearchParams(event.target.value === "inactive" ? { status: "inactive" } : {})}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white outline-none transition focus:border-sky-300/40">
                <option value="active">Active</option>
                <option value="inactive">Jailed / Inactive</option>
              </select>
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
              {connection ? `Delegation actions enabled for ${connection.name}` : "Connect a wallet to stake"}
            </div>
          </div>
        }
      >
        {loading && !data ? <p className="text-sm text-slate-300">Loading validators…</p> : null}
        {error ? (
          <div role="alert" className="mb-3 text-sm text-rose-200">
            <p>{data ? "Unable to refresh; showing previously loaded validators. " : ""}{error}</p>
            <button type="button" onClick={refresh} disabled={loading} className="mt-1 underline disabled:opacity-60">Retry validators</button>
          </div>
        ) : null}
        {data?.length === 0 ? <p className="text-sm text-slate-300">{inactive ? "No jailed or inactive validators found." : "No active validators found."}</p> : null}
        {data && data.length > 0 ? (
          <nav aria-label="Validator pagination" className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
            <span>{visibleValidators.length ? `${(page - 1) * VALIDATORS_PER_PAGE + 1}–${Math.min(page * VALIDATORS_PER_PAGE, data.length)} of ${data.length} validators` : "No validators on this page."}</span>
            <div className="flex items-center gap-4 text-sky-200">
              {page > 1 ? <Link to={validatorListPath(inactive, page - 1)} className="hover:text-white">← Previous</Link> : null}
              {page * VALIDATORS_PER_PAGE < data.length ? <Link to={validatorListPath(inactive, page + 1)} className="hover:text-white">Next →</Link> : null}
              {visibleValidators.length === 0 ? <Link to={validatorListPath(inactive)} className="hover:text-white">First page</Link> : null}
            </div>
          </nav>
        ) : null}
        {data ? (
          <div className="space-y-3">
            {visibleValidators.map((validator) => (
              <Link
                key={validator.operatorAddress}
                to={`/validators/${validator.operatorAddress}`}
                className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <ValidatorIdentity
                    operatorAddress={validator.operatorAddress}
                    moniker={validator.moniker}
                    identity={validator.identity}
                    size="md"
                    showProfileBadge
                  />
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                    <StatusPill status={validator.jailed ? "Jailed" : validator.status === "BOND_STATUS_BONDED" ? "Bonded" : "Inactive"} />
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
