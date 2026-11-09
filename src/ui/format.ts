/** Display formatting helpers. */

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `$${(n / 1e3).toFixed(1)}k`;
  return money(n);
}

export function km(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} km`;
}

/** "0:42", "12:05", "1h 03m" */
export function duration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "3 hours", "2 days", "5 minutes" */
export function humanDuration(ms: number): string {
  const m = ms / 60_000;
  if (m < 1) return 'a moment';
  if (m < 90) return `${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'}`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
  const d = h / 24;
  return `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function stars(tier: number): string {
  return '★'.repeat(tier) + '☆'.repeat(3 - tier);
}
