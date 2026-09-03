import { useApiResource } from "./useApiResource";
import { apiGet } from "../lib/api";
import type { DesmosProfile } from "../types/desmos";

const profiles = new Map<string, { expiresAt: number; promise: Promise<DesmosProfile | null> }>();

function loadProfile(path: string): Promise<DesmosProfile | null> {
  const cached = profiles.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  // Share pending and recent queries across active, unbonding and redelegating
  // entries. Profile availability must never gate wallet state or actions.
  const entry = {
    expiresAt: Infinity,
    promise: apiGet<DesmosProfile | null>(path).catch(() => null).finally(() => {
      entry.expiresAt = Date.now() + 25_000;
    })
  };
  profiles.set(path, entry);
  if (profiles.size > 256) profiles.delete(profiles.keys().next().value!);
  return entry.promise;
}

export function useValidatorProfile(operatorAddress: string) {
  const { data } = useApiResource<DesmosProfile | null>(
    `/api/validators/${encodeURIComponent(operatorAddress)}/profile`,
    { enabled: Boolean(operatorAddress), fetcher: loadProfile, pollMs: 30_000 }
  );
  return data;
}
