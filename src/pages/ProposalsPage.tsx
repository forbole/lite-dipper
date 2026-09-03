import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatProposalStatus } from "../lib/format";
import { getProposals } from "../lib/governance";
import type { ProposalSummary } from "../types/desmos";

export function ProposalsPage() {
  const { data, error, loading } = useApiResource<ProposalSummary[]>("proposals", {
    pollMs: 30_000,
    fetcher: getProposals
  });

  return (
    <Panel title="Proposals" subtitle="Governance proposals from Desmos REST">
      {loading && !data ? <p className="text-sm text-slate-300">Loading proposals…</p> : null}
      {error ? <p role="alert" className="mb-3 text-sm text-rose-200">{data ? "Unable to refresh; showing previously loaded proposals. " : ""}{error}</p> : null}
      {data ? (
        <div className="space-y-3">
          {data.map((proposal) => (
            <Link
              key={proposal.id}
              to={`/proposals/${proposal.id}`}
              className="block rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-base text-white">Proposal #{proposal.id}</p>
                  <p className="mt-1 text-sm text-slate-300">{proposal.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <StatusPill status={formatProposalStatus(proposal.status)} />
                  <span>Ends {formatDateTime(proposal.votingEndTime)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
