import { apiGet } from "../lib/api";
import type { WalletOverviewPayload } from "../types/desmos";
import { useApiResource } from "./useApiResource";

function fetchWalletOverview(path: string) {
  // A refresh after a committed transaction must not reuse a browser snapshot.
  return apiGet<WalletOverviewPayload>(path, { cache: "no-store" });
}

export function useWalletOverview(address?: string) {
  return useApiResource<WalletOverviewPayload>(address ? `/api/wallet/${address}/overview` : "/api/config", {
    enabled: Boolean(address),
    pollMs: 20_000,
    fetcher: fetchWalletOverview
  });
}
