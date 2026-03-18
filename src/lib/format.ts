import { DESMOS_CHAIN } from "../config/chain";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

const INTEGER_FORMAT = new Intl.NumberFormat("en-US");

export function formatNumber(value: number | string): string {
  return INTEGER_FORMAT.format(Number(value || 0));
}

export function formatDateTime(value: string): string {
  if (!value) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function truncateMiddle(value: string, start = 10, end = 8): string {
  if (!value || value.length <= start + end + 3) {
    return value || "N/A";
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatDsmFromMicro(value: string): string {
  const numeric = Number(value || 0) / 10 ** DESMOS_CHAIN.exponent;
  return `${NUMBER_FORMAT.format(numeric)} ${DESMOS_CHAIN.displayDenom}`;
}

export function formatPreciseDsmFromMicro(value: string): string {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return `0 ${DESMOS_CHAIN.displayDenom}`;
  }

  const padded = normalized.padStart(DESMOS_CHAIN.exponent + 1, "0");
  const integerPart = padded.slice(0, -DESMOS_CHAIN.exponent);
  const fractionPart = padded.slice(-DESMOS_CHAIN.exponent).replace(/0+$/, "");
  const groupedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return fractionPart
    ? `${groupedIntegerPart}.${fractionPart} ${DESMOS_CHAIN.displayDenom}`
    : `${groupedIntegerPart} ${DESMOS_CHAIN.displayDenom}`;
}

export function formatFixedDsmFromMicro(value: string): string {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return `0.${"0".repeat(DESMOS_CHAIN.exponent)} ${DESMOS_CHAIN.displayDenom}`;
  }

  const padded = normalized.padStart(DESMOS_CHAIN.exponent + 1, "0");
  const integerPart = padded.slice(0, -DESMOS_CHAIN.exponent);
  const fractionPart = padded.slice(-DESMOS_CHAIN.exponent);
  const groupedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${groupedIntegerPart}.${fractionPart} ${DESMOS_CHAIN.displayDenom}`;
}

export function isPositiveDecimal(value: string): boolean {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return false;
  }

  const [integerPart, fractionPart = ""] = normalized.split(".");
  return /[1-9]/.test(integerPart) || /[1-9]/.test(fractionPart);
}

export function formatFixedDsmFromMicroDecimal(value: string): string {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return `0.${"0".repeat(DESMOS_CHAIN.exponent)} ${DESMOS_CHAIN.displayDenom}`;
  }

  const [microIntegerPartRaw] = normalized.split(".");
  const padded = microIntegerPartRaw.padStart(DESMOS_CHAIN.exponent + 1, "0");
  const integerPart = padded.slice(0, -DESMOS_CHAIN.exponent);
  const fractionPart = padded.slice(-DESMOS_CHAIN.exponent);
  const groupedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${groupedIntegerPart}.${fractionPart} ${DESMOS_CHAIN.displayDenom}`;
}

export function annotateUdsmAmounts(value: string): string {
  if (!value) {
    return value;
  }

  return value.replace(/(\d+)udsm\b/g, (match, amount: string) => {
    return `${match} (${formatPreciseDsmFromMicro(amount)})`;
  });
}

export function parseDsmToMicro(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) {
    throw new Error("Amount is required.");
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return String(Math.round(numeric * 10 ** DESMOS_CHAIN.exponent));
}

export function formatPercent(rate: string): string {
  return `${NUMBER_FORMAT.format(Number(rate || 0) * 100)}%`;
}

export function formatBondStatus(status: string): string {
  const normalized = status.replace(/^BOND_STATUS_/, "");

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatProposalStatus(status: string): string {
  const normalized = status.replace(/^PROPOSAL_STATUS_/, "");

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatMessageType(typeUrl: string): string {
  if (!typeUrl) {
    return "Unknown";
  }

  return typeUrl.split(".").at(-1) ?? typeUrl;
}

export function statusTone(status: string): string {
  const normalized = status.toLowerCase();

  if (normalized.includes("bonded") || normalized.includes("passed") || normalized.includes("success")) {
    return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30";
  }

  if (normalized.includes("unbond") || normalized.includes("deposit") || normalized.includes("voting")) {
    return "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/30";
  }

  if (normalized.includes("jailed") || normalized.includes("fail") || normalized.includes("rejected")) {
    return "bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/30";
  }

  return "bg-slate-400/10 text-slate-200 ring-1 ring-white/10";
}
