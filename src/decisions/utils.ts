export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeSymbol(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    return trimmed;
  }
  return `${trimmed}/USD`;
}

export function baseAssetFromSymbol(symbol: string): string {
  const [base] = symbol.split("/");
  return base ?? symbol;
}

export function parseIsoDate(value: string | undefined | null): number | null {
  if (!value) {
    return null;
  }
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) {
    return null;
  }
  return ts;
}
