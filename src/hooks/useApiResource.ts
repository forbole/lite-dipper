import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface UseApiResourceOptions<T> {
  enabled?: boolean;
  pollMs?: number;
  initialData?: T | null;
}

export function useApiResource<T>(
  path: string,
  options?: UseApiResourceOptions<T>
) {
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs ?? 0;
  const [data, setData] = useState<T | null>(options?.initialData ?? null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const load = async () => {
      try {
        setLoading(true);
        const nextData = await apiGet<T>(path);

        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unknown error");
        }
      } finally {
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
  }, [enabled, path, pollMs, reloadToken]);

  return {
    data,
    loading,
    error,
    refresh() {
      setReloadToken((value) => value + 1);
    }
  };
}
