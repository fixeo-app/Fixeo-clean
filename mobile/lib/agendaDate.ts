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

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

export function agendaDatePreview(dateValue: string, timeValue: string) {
  const iso = parseAgendaDateTime(dateValue, timeValue);
  if (!iso) return '';

  return new Date(iso).toLocaleString('fr-FR', {
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
export function agendaPickerValue(date: string, time: string, now = new Date()) {
  const fallback = pickerDateParts(now);
  const parsed = parseAgendaDateTime(date || fallback.date, time || fallback.time);
  return parsed ? new Date(parsed) : now;
}
