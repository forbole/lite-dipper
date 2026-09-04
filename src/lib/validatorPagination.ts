export const VALIDATORS_PER_PAGE = 20;

export function validatorPage<T>(validators: T[], page = 1): T[] {
  return validators.slice((page - 1) * VALIDATORS_PER_PAGE, page * VALIDATORS_PER_PAGE);
}

export function validatorListPath(inactive: boolean, page = 1): string {
  const params = new URLSearchParams();
  if (inactive) params.set("status", "inactive");
  if (page > 1) params.set("page", String(page));
  return `/validators${params.size ? `?${params}` : ""}`;
}
