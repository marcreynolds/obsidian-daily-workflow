import { ISODate, isISODate } from "./dates";

export type Frequency =
  | { kind: "daily" }
  /** Only these weekdays are scheduled (Monday = 0). */
  | { kind: "weekdays"; days: number[] }
  /** Any `count` days in each calendar week (Monday-based) satisfy it. */
  | { kind: "perWeek"; count: number };

export type WindowSpec =
  | { kind: "overall" }
  | { kind: "calendar-month" }
  | { kind: "rolling"; days: number };

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export interface Ramp {
  /** Weeks over which the target climbs from `from` to the full target. */
  weeks: number;
  from: number;
}

export interface GoalConfig {
  label: string;
  /** Normalized: lower-case, with a leading "#". */
  tag: string;
  frequency: Frequency;
  target: number;
  warning: number;
  start: ISODate;
  end?: ISODate;
  window: WindowSpec;
  /** Below this many scheduled occurrences, show counts instead of a percent. */
  minSamples: number;
  /** Below this many, show the percent but no green/yellow/red status. */
  minStatusSamples: number;
  ramp?: Ramp;
  /** Excused ranges: not scheduled, not counted. */
  pause: DateRange[];
}

export interface ParsedGoals {
  goals: GoalConfig[];
  errors: string[];
}

const WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function parseGoals(raw: unknown): ParsedGoals {
  const entries = Array.isArray(raw) ? raw : [raw];
  const goals: GoalConfig[] = [];
  const errors: string[] = [];

  entries.forEach((entry, index) => {
    const prefix = entries.length > 1 ? `Goal ${index + 1}: ` : "";
    const result = parseGoal(entry);
    if (typeof result === "string") {
      errors.push(`${prefix}${result}`);
    } else {
      goals.push(result);
    }
  });

  return { goals, errors };
}

function parseGoal(raw: unknown): GoalConfig | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "expected a goal definition (key: value pairs).";
  }
  const input = raw as Record<string, unknown>;

  if (typeof input.tag !== "string" || !input.tag.trim()) {
    return 'missing "tag". Quote it, since "#" starts a YAML comment: tag: "#habit/gym".';
  }
  const tag = `#${input.tag.trim().replace(/^#/, "")}`.toLowerCase();

  const start = parseDate(input.start);
  if (!start) {
    return 'missing or invalid "start" (use YYYY-MM-DD).';
  }
  let end: ISODate | undefined;
  if (input.end !== undefined && input.end !== null) {
    end = parseDate(input.end);
    if (!end) {
      return 'invalid "end" (use YYYY-MM-DD).';
    }
  }

  const frequency = parseFrequency(input.frequency ?? "daily");
  if (typeof frequency === "string") {
    return frequency;
  }

  const target = parsePercent(input.target ?? 0.9);
  if (target === undefined) {
    return 'invalid "target" (use e.g. 90%).';
  }
  const warning = parsePercent(input.warning ?? Math.max(0, target - 0.1));
  if (warning === undefined || warning > target) {
    return 'invalid "warning" (a percentage at or below the target).';
  }

  const window = parseWindow(input.window ?? "rolling-30d");
  if (!window) {
    return 'invalid "window" (overall, calendar-month, or rolling-30d).';
  }

  const ramp = parseRamp(input.ramp, target);
  if (typeof ramp === "string") {
    return ramp;
  }

  const pause = parsePause(input.pause);
  if (typeof pause === "string") {
    return pause;
  }

  const minSamples = parseCount(input["min-samples"], 5);
  const minStatusSamples = parseCount(input["min-status-samples"], 7);
  if (minSamples === undefined || minStatusSamples === undefined) {
    return '"min-samples" and "min-status-samples" must be whole numbers.';
  }

  return {
    label: typeof input.label === "string" && input.label.trim()
      ? input.label.trim()
      : tag,
    tag,
    frequency,
    target,
    warning,
    start,
    end,
    window,
    minSamples,
    minStatusSamples,
    ramp,
    pause,
  };
}

function parseDate(value: unknown): ISODate | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return isISODate(value) ? value : undefined;
}

function parsePercent(value: unknown): number | undefined {
  let number: number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && /^\s*\d+(\.\d+)?\s*%\s*$/.test(value)) {
    number = parseFloat(value) / 100;
  } else {
    return undefined;
  }
  if (number > 1) {
    number /= 100;
  }
  return number >= 0 && number <= 1 ? number : undefined;
}

function parseCount(value: unknown, fallback: number): number | undefined {
  if (value === undefined || value === null) {
    return fallback;
  }
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function parseFrequency(value: unknown): Frequency | string {
  const invalid =
    'invalid "frequency" (daily, 3/week, or weekdays like [mon, wed, fri]).';

  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "daily") {
      return { kind: "daily" };
    }
    const perWeek = /^(\d+)\s*\/\s*week$/.exec(text);
    if (perWeek) {
      const count = Number(perWeek[1]);
      return count >= 1 && count <= 7 ? { kind: "perWeek", count } : invalid;
    }
    return parseFrequency(text.split(/[\s,]+/).filter(Boolean));
  }

  if (Array.isArray(value) && value.length > 0) {
    const days = value.map((item) =>
      WEEKDAY_NAMES.indexOf(String(item).trim().toLowerCase().slice(0, 3)));
    if (days.every((day) => day >= 0)) {
      return { kind: "weekdays", days: [...new Set(days)].sort() };
    }
  }

  return invalid;
}

function parseWindow(value: unknown): WindowSpec | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim().toLowerCase();
  if (text === "overall") {
    return { kind: "overall" };
  }
  if (text === "calendar-month") {
    return { kind: "calendar-month" };
  }
  const rolling = /^rolling-(\d+)d$/.exec(text);
  if (rolling && Number(rolling[1]) >= 1) {
    return { kind: "rolling", days: Number(rolling[1]) };
  }
  return undefined;
}

function parseRamp(value: unknown, target: number): Ramp | undefined | string {
  if (value === undefined || value === null) {
    return undefined;
  }
  const invalid = 'invalid "ramp" (use { weeks: 4, from: 70% }).';
  if (typeof value !== "object" || Array.isArray(value)) {
    return invalid;
  }
  const input = value as Record<string, unknown>;
  const from = parsePercent(input.from);
  if (
    from === undefined || from > target ||
    !Number.isInteger(input.weeks) || (input.weeks as number) < 1
  ) {
    return invalid;
  }
  return { weeks: input.weeks as number, from };
}

function parsePause(value: unknown): DateRange[] | string {
  if (value === undefined || value === null) {
    return [];
  }
  const invalid =
    'invalid "pause" (a list of "YYYY-MM-DD..YYYY-MM-DD" ranges).';
  if (!Array.isArray(value)) {
    return invalid;
  }

  const ranges: DateRange[] = [];
  for (const item of value) {
    let from: ISODate | undefined;
    let to: ISODate | undefined;
    if (typeof item === "string") {
      const match = /^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/
        .exec(item.trim());
      from = match?.[1];
      to = match?.[2];
    } else if (item && typeof item === "object") {
      from = parseDate((item as Record<string, unknown>).from);
      to = parseDate((item as Record<string, unknown>).to);
    }
    if (!from || !to || to < from) {
      return invalid;
    }
    ranges.push({ from, to });
  }
  return ranges;
}
