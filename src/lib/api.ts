import { HttpError } from "./httpError";

export async function apiGet<T>(path: string, options?: Pick<RequestInit, "cache">): Promise<T> {
  const controller = new AbortController();
  // A request that never settles must not hold the polling hook's in-flight
  // guard (or a shared profile promise) forever, including a stalled body.
  const timeout = setTimeout(() => controller.abort(new Error("The data request timed out. Please try again.")), 15_000);
  try {
    const response = await fetch(path, {
      cache: options?.cache ?? "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new HttpError(response.status, await response.text());
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}
