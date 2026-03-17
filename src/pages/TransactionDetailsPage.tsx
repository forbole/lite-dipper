import { Panel } from "../components/ui/Panel";
import { StatusPill } from "../components/ui/StatusPill";
import { useApiResource } from "../hooks/useApiResource";
import { annotateUdsmAmounts, formatDateTime, formatMessageType, formatNumber, truncateMiddle } from "../lib/format";
import type { TransactionDetailsPayload } from "../types/desmos";
import { useParams } from "react-router-dom";

function EventList({
  events
}: {
  events: Array<{
    type: string;
    attributes: Array<{
      key: string;
      value: string;
    }>;
  }>;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-300">No events returned.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event, index) => (
        <div key={`${event.type}-${index}`} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 p-4">
          <p className="text-sm text-white">{event.type}</p>
          {event.attributes.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No attributes.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {event.attributes.map((attribute, attributeIndex) => (
                <div
                  key={`${attribute.key}-${attribute.value}-${attributeIndex}`}
                  className="grid gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs md:grid-cols-[180px_1fr]"
                >
                  <span className="text-slate-400">{attribute.key || "key"}</span>
                  <span className="break-all text-slate-200">{annotateUdsmAmounts(attribute.value || "value")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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

      <Panel title="Message Logs" subtitle="Per-message logs and events emitted during execution">
        {data.logs.length === 0 ? (
          <p className="text-sm text-slate-300">No structured message logs returned.</p>
        ) : (
          <div className="space-y-4">
            {data.logs.map((log) => (
              <div key={log.msgIndex} className="rounded-2xl border border-white/[0.08] bg-slate-950/45 p-4">
                <p className="text-sm text-white">Message #{log.msgIndex}</p>
                {log.log ? (
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">{annotateUdsmAmounts(log.log)}</pre>
                ) : null}
                <div className="mt-4">
                  <EventList events={log.events} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Transaction Events" subtitle="Top-level events emitted by the transaction response">
        <EventList events={data.events} />
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
