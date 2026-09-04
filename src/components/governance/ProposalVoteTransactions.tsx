import { Link } from "react-router-dom";
import { Panel } from "../ui/Panel";
import { StatusPill } from "../ui/StatusPill";
import { formatDateTime, truncateMiddle } from "../../lib/format";
import { RECENT_PROPOSAL_VOTES_LIMIT } from "../../lib/proposalVoteTransactions";
import type { ProposalVoteTransactionsPayload } from "../../types/desmos";
import { VOTE_OPTIONS } from "./ProposalVotingProgress";

export function ProposalVoteTransactions({ data, error, loading, refresh }: {
  data: ProposalVoteTransactionsPayload | null; error: string | null; loading: boolean; refresh: () => void;
}) {
  return (
    <Panel title="Recent vote transactions" subtitle={`Up to ${RECENT_PROPOSAL_VOTES_LIMIT} latest vote transactions for this proposal`}
      action={<button type="button" onClick={refresh} disabled={loading}
        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-sky-200 disabled:opacity-50">
        {loading ? "Refreshing votes…" : "Refresh votes"}
      </button>}>
      {loading && !data ? <p className="text-sm text-slate-300">Loading vote transactions…</p> : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-amber-200">
          {data ? "Unable to refresh vote transactions; showing previously loaded data." : "Recent vote transactions are unavailable."} {error} Try refreshing.
        </p>
      ) : null}
      {data?.transactions.length === 0 && !error ? <p className="text-sm text-slate-300">No vote transactions found for this proposal.</p> : null}
      {data && data.transactions.length > 0 ? (
        <ol className="space-y-3">
          {data.transactions.map((transaction) => (
            <li key={transaction.hash} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link to={`/transactions/${transaction.hash}`} title={transaction.hash}
                  className="font-mono text-sm text-sky-200 hover:text-white hover:underline">
                  {truncateMiddle(transaction.hash, 12, 8)}
                </Link>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <StatusPill status={transaction.code === null ? "Unknown result" : transaction.code === 0 ? "Success" : "Failed"} />
                  <Link to={`/blocks/${transaction.height}`} className="text-sky-200 hover:underline">H {transaction.height}</Link>
                  <span>{formatDateTime(transaction.timestamp)}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {transaction.votes.slice(0, 3).map((vote, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {vote.voter ? (
                      <Link to={`/accounts/${vote.voter}`} title={vote.voter} className="text-sky-200 hover:text-white hover:underline">
                        {truncateMiddle(vote.voter, 12, 8)}
                      </Link>
                    ) : <span className="text-slate-400">Voter unavailable</span>}
                    {vote.options.length ? vote.options.map((entry, optionIndex) => {
                      const option = VOTE_OPTIONS.find((candidate) => candidate.key === entry.option);
                      return (
                        <span key={optionIndex} className={`inline-flex items-center gap-1.5 ${option?.text ?? "text-slate-400"}`}>
                          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${option?.dot ?? "bg-slate-400"}`} />
                          {option?.label ?? "Unknown option"}{vote.weighted ? ` ${entry.percentage ?? "(weight unavailable)"}` : ""}
                        </span>
                      );
                    }) : <span className="text-slate-400">Vote option unavailable</span>}
                  </div>
                ))}
                {transaction.votes.length === 0 ? <p className="text-slate-400">Vote details unavailable. Open the transaction for details.</p> : null}
                {transaction.voteCount > 3 ? <p className="text-xs text-slate-400">{transaction.voteCount - 3} more vote messages in this transaction.</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-4 text-xs text-slate-400">
        Recent submissions are not the current tally: voters can change their vote, and transaction counts do not measure voting power.
      </p>
      {data ? <p className="mt-2 text-xs text-slate-400">Updated {formatDateTime(data.updatedAt)} · Refreshes every 30 seconds</p> : null}
    </Panel>
  );
}
