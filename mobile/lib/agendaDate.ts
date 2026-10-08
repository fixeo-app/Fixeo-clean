function digits(value: string, max: number) {
  return value.replace(/[^0-9]/g, '').slice(0, max);
}

export function formatAgendaDateInput(value: string) {
  const raw = digits(value, 8);
  if (raw.length <= 2) return raw;
  if (raw.length <= 4) return `${raw.slice(0, 2)}/${raw.slice(2)}`;
  return `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
}

export function formatAgendaTimeInput(value: string) {
  const raw = digits(value, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
}

export function parseAgendaDateTime(dateValue: string, timeValue: string) {
  const dateMatch = dateValue.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = timeValue.trim().match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null;
  }

  // Interpret the entered wall time in Casablanca, independently of device TZ.
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const matches = [-60, 0, 60].map(offset => new Date(wall + offset * 60000)).filter(candidate => {
    const parts = formatter.formatToParts(candidate);
    const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
    return part('year') === year && part('month') === month && part('day') === day && part('hour') === hour && part('minute') === minute;
  });
  // Refuse the ambiguous/repeated hour at DST transitions rather than shifting it.
  return matches.length === 1 ? matches[0].toISOString() : null;
}

export function agendaDatePreview(dateValue: string, timeValue: string) {
  const iso = parseAgendaDateTime(dateValue, timeValue);
  if (!iso) return '';

  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Casablanca',
    hourCycle: 'h23',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pickerDateParts(value: Date) {
  const two = (n: number) => String(n).padStart(2, '0');
  return { date: `${two(value.getDate())}/${two(value.getMonth() + 1)}/${value.getFullYear()}`,
    time: `${two(value.getHours())}:${two(value.getMinutes())}` };
}
export function moroccoDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)?.value || '';
  return { date: `${get('day')}/${get('month')}/${get('year')}`, time: `${get('hour')}:${get('minute')}` };
}
export function agendaPickerValue(date: string, time: string, now = new Date()) {
  const fallback = moroccoDateParts(now);
  const d = parseAgendaDateTime(date, '12:00') ? date : fallback.date;
  const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback.time;
  const [day, month, year] = d.split('/').map(Number), [hour, minute] = t.split(':').map(Number);
  // Native pickers use the device timezone; this Date carries wall components only.
  return new Date(year, month - 1, day, hour, minute);
}
