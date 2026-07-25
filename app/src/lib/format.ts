/** Formatting helpers — JMD money, relative time, initials. */

export function formatJmd(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `JMD ${Math.round(amount).toLocaleString('en-JM')}`;
}

export function formatRate(
  min: number | null,
  max: number | null,
  unit: string,
): string {
  const unitLabel = unit === 'hour' ? 'hr' : unit === 'day' ? 'day' : 'job';
  if (min == null && max == null) return 'Rate on request';
  if (min != null && max != null && min !== max) {
    return `${formatJmd(min)}–${Math.round(max).toLocaleString('en-JM')}/${unitLabel}`;
  }
  return `${formatJmd(min ?? max)}/${unitLabel}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yest';
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-JM', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-JM', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
