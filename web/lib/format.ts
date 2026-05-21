const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctSigned = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

const qtyFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return usd.format(value);
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return usdCompact.format(value);
}

/** Pass a decimal ratio: 0.0123 → "1.23%". */
export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return pct.format(value);
}

/** Signed percent: 0.0123 → "+1.23%". */
export function formatPctSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return pctSigned.format(value);
}

export function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return qtyFmt.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
