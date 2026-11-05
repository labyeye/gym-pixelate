import { waDigits } from './countries';

export const inr = (n?: number | null, decimals = 0) => {
  const v = Number(n || 0);
  return (
    (v < 0 ? '-₹' : '₹') +
    Math.abs(v).toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};
const p2 = (n: number) => String(n).padStart(2, '0');
/** DD-MM-YYYY */
export const fmtDate = (d?: string | Date | null) => {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(+x) ? '—' : `${p2(x.getDate())}-${p2(x.getMonth() + 1)}-${x.getFullYear()}`;
};
/** DD-MM-YYYY, HH:MM */
export const fmtDateTime = (d?: string | Date | null) => {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(+x) ? '—' : `${fmtDate(x)}, ${p2(x.getHours())}:${p2(x.getMinutes())}`;
};
export const fmtTime = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const pad = (n: number) => String(n).padStart(2, '0');
/** local YYYY-MM-DD (toISOString would give the UTC date) */
export const todayStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toInputDate = (d?: string | Date | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : '';
export const idOf = (x: any): string =>
  (x && typeof x === 'object' ? x._id || x.id : x) || '';
export const daysFromNow = (d: string | Date) =>
  Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
export const titleCase = (s?: string) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const waLink = (phone?: string, text = '') => {
  const d = waDigits(phone);
  return d
    ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
    : null;
};
export const r2 = (n: number) => Math.round(n * 100) / 100;
