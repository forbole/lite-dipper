import { getVotingProgress, tallyPercentage } from "../../lib/governance";
import type { ProposalTally, ProposalTallyParams } from "../../types/desmos";

export const VOTE_OPTIONS = [
  { key: "yes", label: "Yes", dot: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-400/25" },
  { key: "no", label: "No", dot: "bg-rose-400", text: "text-rose-300", border: "border-rose-400/25" },
  { key: "abstain", label: "Abstain", dot: "bg-slate-400", text: "text-slate-300", border: "border-slate-400/25" },
  { key: "noWithVeto", label: "No With Veto", dot: "bg-amber-400", text: "text-amber-300", border: "border-amber-400/25" }
] as const;

const STATUS = {
  passing: { text: "Currently passing", color: "text-emerald-300" },
  quorum: { text: "Quorum not met", color: "text-amber-300" },
  abstaining: { text: "No non-abstaining votes", color: "text-amber-300" },
  veto: { text: "Veto threshold exceeded", color: "text-rose-300" },
  approval: { text: "Approval threshold not met", color: "text-amber-300" }
};

// Numbers are only used for CSS and ARIA; voting rules use exact BigInt ratios.
function barValue(percentage: string): number {
  return Math.min(100, Math.max(0, Number.parseFloat(percentage)));
}

function ThresholdBar({ label, percentage, threshold, description, color }: {
  label: string; percentage: string; threshold: string; description: string; color: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-slate-200">{label}: {percentage}</p>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={barValue(percentage)} aria-valuetext={`${percentage}. ${description}`}
        className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${barValue(percentage)}%` }} />
        <div aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
          style={{ left: `${barValue(threshold)}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  );
}

export function ProposalVotingProgress({ tally, bondedPower, params }: {
  tally: ProposalTally; bondedPower: bigint; params?: ProposalTallyParams;
}) {
  const total = Object.values(tally).reduce((sum, amount) => sum + BigInt(amount), 0n);
  const participation = tallyPercentage(total.toString(), bondedPower);
  const progress = params ? getVotingProgress(tally, bondedPower.toString(), params) : undefined;
  const status = progress ? STATUS[progress.status] : undefined;

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-white">Voting progress</h3>
        <p aria-live="polite" className={`text-sm font-medium ${status?.color ?? "text-slate-400"}`}>
          {status?.text ?? "Passing status unavailable"}
        </p>
      </div>
      <p className="mt-2 text-sm text-slate-200">Participation: {participation}</p>
      <div role="progressbar" aria-label="Bonded voting power participation" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={barValue(participation)}
        aria-valuetext={`${participation} of bonded power voted${progress ? `; quorum ${progress.quorumPercent}, ${progress.quorumMet ? "met" : "not met"}` : "; quorum unavailable"}`}
        className="relative mt-2 flex h-4 overflow-hidden rounded-full bg-slate-800">
        {VOTE_OPTIONS.map((option) => (
          <div key={option.key} aria-hidden="true" className={`h-full ${option.dot}`}
            style={{ width: `${barValue(tallyPercentage(tally[option.key], bondedPower))}%` }} />
        ))}
        {progress ? (
          <div aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
            style={{ left: `${barValue(progress.quorumPercent)}%` }} />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-400">
        <span>0%</span>
        <span>{progress ? `Quorum ≥ ${progress.quorumPercent} · ${progress.quorumMet ? "Met" : "Not met"}` : "Quorum unavailable"}</span>
        <span>100%</span>
      </div>
      {progress ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ThresholdBar label="Approval" percentage={progress.yesPercent} threshold={progress.approvalThresholdPercent}
            color="bg-emerald-400" description={`Yes needs > ${progress.approvalThresholdPercent} of non-abstaining votes`} />
          <ThresholdBar label="Veto" percentage={progress.vetoPercent} threshold={progress.vetoThresholdPercent}
            color="bg-amber-400" description={`No With Veto blocks passage at > ${progress.vetoThresholdPercent} of all votes cast`} />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-slate-400">Current estimate if voting ended now. The final outcome is determined on chain when voting ends.</p>
    </div>
  );
}
