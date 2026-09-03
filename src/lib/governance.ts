import { DESMOS_CHAIN } from "../config/chain";
import { HttpError } from "./httpError";
import type { ProposalDetailsPayload, ProposalSummary, ProposalTally } from "../types/desmos";

interface RestMessage {
  "@type"?: string;
  title?: string;
  summary?: string;
  description?: string;
  content?: { title?: string; description?: string };
  plan?: { name?: string };
}

interface RestProposal {
  id: string;
  title?: string;
  summary?: string;
  status: string;
  proposer?: string;
  submit_time?: string;
  voting_end_time?: string;
  metadata?: string;
  expedited?: boolean;
  messages?: RestMessage[];
  final_tally_result?: Record<string, unknown>;
}

async function governanceGet<T>(path: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<T> {
  const response = await fetch(new URL(path, restUrl), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Desmos governance API returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function normalizeProposal(proposal: RestProposal): ProposalSummary {
  const firstMessage = proposal.messages?.[0];

  return {
    id: proposal.id,
    title: proposal.title || firstMessage?.title || firstMessage?.content?.title ||
      firstMessage?.plan?.name || proposal.metadata || "Untitled proposal",
    status: proposal.status,
    proposer: proposal.proposer ?? "",
    submitTime: proposal.submit_time ?? "",
    votingEndTime: proposal.voting_end_time ?? ""
  };
}

function extractTally(source?: Record<string, unknown>): ProposalTally | undefined {
  const values = [
    source?.yes_count ?? source?.yes,
    source?.no_count ?? source?.no,
    source?.abstain_count ?? source?.abstain,
    source?.no_with_veto_count ?? source?.no_with_veto
  ];

  // Missing or malformed counts are unavailable, not zero votes.
  if (!values.every((value): value is string => typeof value === "string" && /^\d+$/.test(value))) {
    return undefined;
  }

  return { yes: values[0], no: values[1], abstain: values[2], noWithVeto: values[3] };
}

export async function getProposals(_path?: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<ProposalSummary[]> {
  const response = await governanceGet<{ proposals: RestProposal[] }>(
    "/cosmos/gov/v1/proposals?pagination.limit=20&pagination.reverse=true", restUrl
  );
  return response.proposals.map(normalizeProposal);
}

export async function getProposalDetails(proposalId: string, restUrl: string = DESMOS_CHAIN.restUrl): Promise<ProposalDetailsPayload> {
  if (!/^[1-9]\d*$/.test(proposalId)) {
    throw new Error("Invalid proposal id.");
  }

  const path = `/cosmos/gov/v1/proposals/${proposalId}`;
  const { proposal } = await governanceGet<{ proposal: RestProposal }>(path, restUrl);
  const isVoting = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const isFinal = ["PROPOSAL_STATUS_PASSED", "PROPOSAL_STATUS_REJECTED", "PROPOSAL_STATUS_FAILED"]
    .includes(proposal.status);
  let tally: ProposalTally | undefined;
  let tallyError: string | undefined;

  if (isVoting) {
    try {
      // final_tally_result remains zero during voting. Query the chain's live
      // stake-weighted tally; counting vote transactions would be incorrect.
      const response = await governanceGet<{ tally: Record<string, unknown> }>(`${path}/tally`, restUrl);
      tally = extractTally(response.tally);
      if (!tally) throw new Error("The API returned an incomplete tally.");
    } catch (error) {
      tallyError = error instanceof Error ? error.message : "Unable to load the current tally.";
    }
  } else if (isFinal) {
    tally = extractTally(proposal.final_tally_result);
    if (!tally) tallyError = "The API did not return a final tally.";
  }

  const firstMessage = proposal.messages?.[0];
  return {
    proposal: {
      ...normalizeProposal(proposal),
      summary: proposal.summary || firstMessage?.summary || firstMessage?.content?.description ||
        firstMessage?.description || "",
      metadata: proposal.metadata ?? "",
      expedited: Boolean(proposal.expedited),
      messages: (proposal.messages ?? []).map((message) => message["@type"] ?? "Unknown"),
      tally,
      tallyKind: isVoting ? "live" : isFinal ? "final" : undefined,
      tallyError
    },
    updatedAt: new Date().toISOString()
  };
}

export function tallyPercentage(amount: string, total: bigint): string {
  if (total === 0n) return "0.00%";
  const hundredths = (BigInt(amount) * 10_000n + total / 2n) / total;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}
