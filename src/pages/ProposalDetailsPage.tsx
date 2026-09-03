import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { formatDateTime, formatPreciseDsmFromMicro, formatProposalStatus } from "../lib/format";
import { getProposalDetails, tallyPercentage } from "../lib/governance";
import type { ProposalDetailsPayload } from "../types/desmos";
import type { ProposalVoteOption } from "../wallet/types";
import { useWallet } from "../wallet/WalletProvider";
import { useParams } from "react-router-dom";

export function ProposalDetailsPage() {
  const { proposalId } = useParams();
  const { connection, voteOnProposal } = useWallet();
  const { data, error, loading, refresh } = useApiResource<ProposalDetailsPayload>(proposalId ?? "", {
    enabled: Boolean(proposalId),
    pollMs: 30_000,
    fetcher: getProposalDetails
  });
  const [voteOption, setVoteOption] = useState<ProposalVoteOption>("yes");
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteTxHash, setVoteTxHash] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  if (!proposalId) {
    return <div className="text-sm text-rose-200">Missing proposal id.</div>;
  }

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading proposal…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  const proposal = data.proposal;
  const isVotingPeriod = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const tally = proposal.tally;
  const totalVotingPower = tally
    ? Object.values(tally).reduce((total, amount) => total + BigInt(amount), 0n)
    : 0n;

  async function handleVoteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingVote(true);
    setVoteTxHash(null);
    setVoteError(null);

    try {
      const result = await voteOnProposal({
        proposalId: proposal.id,
        option: voteOption
      });

      setVoteTxHash(result.transactionHash);
      refresh();
    } catch (nextError) {
      setVoteError(nextError instanceof Error ? nextError.message : "Unable to submit proposal vote.");
    } finally {
      setSubmittingVote(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-rose-200">
          Unable to refresh; showing previously loaded data. {error}
        </p>
      ) : null}
      <Panel
        title={`Proposal #${proposal.id}`}
        subtitle={proposal.title}
        action={
          <button type="button" onClick={refresh} disabled={loading}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-sky-200 disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Status</p>
            <div className="mt-2">
              <StatusPill status={formatProposalStatus(proposal.status)} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Submit Time</p>
            <p className="mt-2 text-white">{formatDateTime(proposal.submitTime)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Voting End</p>
            <p className="mt-2 text-white">{formatDateTime(proposal.votingEndTime)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Expedited</p>
            <p className="mt-2 text-white">{proposal.expedited ? "Yes" : "No"}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Updated {formatDateTime(data.updatedAt)} · Refreshes every 30 seconds
        </p>
      </Panel>

      <Panel title="Summary" subtitle="Governance metadata and decoded messages">
        <div className="space-y-4 text-sm text-slate-300">
          <p>{proposal.summary || "No summary provided."}</p>
          {proposal.metadata ? <p>Metadata: {proposal.metadata}</p> : null}
          <div className="space-y-2">
            {proposal.messages.map((message, index) => (
              <div key={`${message}-${index}`} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3">
                {message}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {proposal.tallyKind ? (
        <Panel
          title={proposal.tallyKind === "live" ? "Live Tally" : "Final Tally"}
          subtitle="Stake-weighted voting power in DSM; percentages include abstentions"
        >
          {proposal.tallyError ? (
            <p role="alert" className="text-sm text-amber-200">
              Voting totals are currently unavailable. {proposal.tallyError} Try refreshing.
            </p>
          ) : null}
          {tally ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {([
                  ["Yes", tally.yes], ["No", tally.no],
                  ["Abstain", tally.abstain], ["No With Veto", tally.noWithVeto]
                ] as const).map(([label, amount]) => (
                  <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <p className="text-sm text-slate-400">{label}</p>
                    <p className="mt-2 break-words text-white">{formatPreciseDsmFromMicro(amount)}</p>
                    <p className="mt-1 text-sm text-slate-300">{tallyPercentage(amount, totalVotingPower)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-300">
                Total voted: {formatPreciseDsmFromMicro(totalVotingPower.toString())}
              </p>
              {totalVotingPower === 0n ? <p className="mt-2 text-sm text-slate-400">No voting power recorded.</p> : null}
              {isVotingPeriod ? (
                <p className="mt-2 text-xs text-slate-400">The tally can change until voting ends. The chain determines the final outcome.</p>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : null}

      {isVotingPeriod ? (
        <Panel
          title="Vote"
          subtitle={connection ? `Sign with ${connection.name}` : "Connect Keplr or Ledger on the Wallet page to vote"}
        >
          {!connection ? (
            <p className="text-sm text-slate-300">Voting stays disabled until a wallet is connected.</p>
          ) : (
            <form className="space-y-4" onSubmit={handleVoteSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Vote Option</span>
                <select
                  value={voteOption}
                  onChange={(event) => setVoteOption(event.target.value as ProposalVoteOption)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-sky-300/40"
                >
                  <option value="yes">Yes</option>
                  <option value="abstain">Abstain</option>
                  <option value="no">No</option>
                  <option value="no_with_veto">No with veto</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={submittingVote}
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(90deg,rgba(14,165,233,0.95),rgba(252,211,77,0.9))] px-4 py-3 font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingVote ? "Submitting vote…" : "Sign vote"}
              </button>
            </form>
          )}

          {voteTxHash ? (
            <p className="mt-4 break-all text-sm text-emerald-200">
              Broadcasted tx:{" "}
              <Link to={`/transactions/${voteTxHash}`} className="text-sky-200 transition hover:text-white hover:underline">
                {voteTxHash}
              </Link>
            </p>
          ) : null}
          {voteError ? <p className="mt-4 text-sm text-rose-200">{voteError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
