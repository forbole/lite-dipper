import { Panel } from "../components/ui/Panel";
import { CollapsibleJson } from "../components/ui/CollapsibleJson";
import { StatusPill } from "../components/ui/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { annotateUdsmAmounts, formatDateTime, formatMessageType, formatNumber, truncateMiddle } from "../lib/format";
import type { TransactionDetailsPayload } from "../types/desmos";
import { useParams } from "react-router-dom";

export function TransactionDetailsPage() {
  const { hash } = useParams();
  const { data, error, loading } = useApiResource<TransactionDetailsPayload>(`/api/transactions/${hash}`, {
    enabled: Boolean(hash)
  });

  if (!hash) {
    return <div className="text-sm text-rose-200">Missing transaction hash.</div>;
  }

  if (loading && !data) {
    return <div className="text-sm text-slate-300">Loading transaction…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-rose-200">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Panel title="Transaction Overview" subtitle={truncateMiddle(data.hash, 16, 12)}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Result</p>
            <div className="mt-2">
              <StatusPill status={data.code === 0 ? "Success" : `Failed (${data.code})`} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Height</p>
            <p className="mt-2 text-white">{formatNumber(data.height)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Timestamp</p>
            <p className="mt-2 text-white">{formatDateTime(data.timestamp)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <p className="text-sm text-slate-400">Gas Used</p>
            <p className="mt-2 text-white">{formatNumber(data.gasUsed || 0)}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Messages" subtitle="Decoded message list from the transaction body">
        <div className="space-y-3">
          {data.messages.map((message, index) => (
            <div key={`${message.typeUrl}-${index}`} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 p-4">
              <p className="text-sm text-white">{formatMessageType(message.typeUrl)}</p>
              <pre className="mt-3 overflow-x-auto text-xs text-slate-300 whitespace-pre-wrap">{annotateUdsmAmounts(message.preview)}</pre>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Raw Log" subtitle="Execution log returned by the chain for success or failure diagnosis">
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-slate-950/45 p-4 text-xs text-slate-300">
          {annotateUdsmAmounts(data.rawLog || "No raw log returned.")}
        </pre>
      </Panel>

      <Panel title="Message Logs" subtitle={`${formatNumber(data.logs.length)} message ${data.logs.length === 1 ? "log" : "logs"} · Expand JSON to inspect execution details`}>
        {data.logs.length === 0 ? (
          <p className="text-sm text-slate-300">No structured message logs returned.</p>
        ) : (
          <CollapsibleJson key={data.hash} value={data.logs} label="Message logs JSON" />
        )}
      </Panel>

      <Panel title="Transaction Events" subtitle={`${formatNumber(data.events.length)} ${data.events.length === 1 ? "event" : "events"} · Expand JSON to inspect transaction events`}>
        {data.events.length === 0 ? (
          <p className="text-sm text-slate-300">No events returned.</p>
        ) : (
          <CollapsibleJson key={data.hash} value={data.events} label="Transaction events JSON" />
        )}
      </Panel>

      <Panel title="Signers" subtitle="Addresses found in the transaction signer list">
        <div className="space-y-2">
          {data.signerAddresses.map((address) => (
            <div key={address} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
              {truncateMiddle(address)}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
