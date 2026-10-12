// Calendar-date helpers on "YYYY-MM-DD" strings. Everything is computed in
// UTC so results never depend on the machine's time zone or DST.

export type ISODate = string;

const DAY_MS = 86_400_000;

function toMs(date: ISODate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromMs(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** Every date from `from` to `to`, inclusive. Empty when `to` < `from`. */
export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: ISODate): number {
  return (new Date(toMs(date)).getUTCDay() + 6) % 7;
}

export function weekStart(date: ISODate): ISODate {
  return addDays(date, -weekdayIndex(date));
}

export function monthStart(date: ISODate): ISODate {
  return `${date.slice(0, 8)}01`;
}

export function monthEnd(date: ISODate): ISODate {
  const [year, month] = date.split("-").map(Number);
  return fromMs(Date.UTC(year, month, 0));
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
