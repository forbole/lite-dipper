import { DESMOS_CHAIN } from "../../config/chain";
import { useApiResource } from "../../hooks/useApiResource";
import { apiGet } from "../../lib/api";
import { formatFixedDsmFromMicro } from "../../lib/format";

async function fetchAvailableDsm(path: string): Promise<string> {
  const response = await apiGet<{ balance?: { denom?: unknown; amount?: unknown } } | null>(path);
  const balance = response?.balance;
  if (balance?.denom !== DESMOS_CHAIN.denom || typeof balance.amount !== "string" || !/^\d+$/.test(balance.amount)) {
    throw new Error("The API returned an invalid DSM balance.");
  }
  return BigInt(balance.amount).toString();
}

export function LedgerAddressBalance({ address }: { address: string }) {
  // Fetch only spendable DSM, without loading staking/reward history for all
  // ten addresses or waiting on any further Ledger communication.
  const url = new URL(`/cosmos/bank/v1beta1/spendable_balances/${encodeURIComponent(address)}/by_denom`, DESMOS_CHAIN.restUrl);
  url.searchParams.set("denom", DESMOS_CHAIN.denom);
  const { data, error, loading, refresh } = useApiResource<string>(url.toString(), {
    fetcher: fetchAvailableDsm,
    pollMs: 20_000
  });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-400">Available:</span>
      {data !== null ? (
        <span className="tabular-nums text-sky-100">{formatFixedDsmFromMicro(data)}</span>
      ) : loading ? (
        <span className="inline-flex items-center gap-2 text-slate-400">
          <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
          Loading balance…
        </span>
      ) : null}
      {error ? (
        <>
          <span className="text-amber-200">{data !== null ? "Update failed; balance may be out of date." : "Balance unavailable"}</span>
          <button type="button" onClick={refresh} disabled={loading} className="text-sky-200 underline disabled:opacity-60">
            Retry balance
          </button>
        </>
      ) : null}
    </div>
  );
}
