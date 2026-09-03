import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface UseApiResourceOptions<T> {
  enabled?: boolean;
  pollMs?: number;
  initialData?: T | null;
  fetcher?: (path: string) => Promise<T>;
}

export function useApiResource<T>(
  path: string,
  options?: UseApiResourceOptions<T>
) {
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs ?? 0;
  const fetcher = options?.fetcher ?? apiGet<T>;
  const [resource, setResource] = useState<{ path: string; data: T | null }>({
    path,
    data: options?.initialData ?? null
  });
  const data = resource.path === path ? resource.data : null;
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let intervalId: number | undefined;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        setLoading(true);
        const nextData = await fetcher(path);

        if (!cancelled) {
          setResource({ path, data: nextData });
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unknown error");
        }
      } finally {
        inFlight = false;
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    if (pollMs > 0) {
      intervalId = window.setInterval(() => {
        void load();
      }, pollMs);
    }

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, path, pollMs, reloadToken, fetcher]);

  return {
    data,
    loading,
    error,
    refresh() {
      setReloadToken((value) => value + 1);
    }
  };
}
