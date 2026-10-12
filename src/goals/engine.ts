import { DateRange, GoalConfig } from "./config";
import {
  addDays,
  datesBetween,
  diffDays,
  ISODate,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  weekdayIndex,
  weekStart,
} from "./dates";

/** What a daily note says about one goal on one day. */
export interface DayRecord {
  completed: boolean;
  /** Checkbox marked "[-]": the occurrence was deliberately dropped. */
  cancelled: boolean;
}

export type DayLookup = (date: ISODate) => DayRecord | undefined;

export interface Stats {
  completed: number;
  scheduled: number;
  /** completed / scheduled, or null when nothing is scheduled yet. */
  rate: number | null;
}

export type Status = "collecting" | "neutral" | "good" | "warn" | "bad";

export interface WindowReport {
  label: string;
  range: DateRange;
  stats: Stats;
  status: Status;
}

export interface GoalReport {
  goal: GoalConfig;
  /** Today's effective target, which is lower than the goal's during a ramp. */
  target: number;
  warning: number;
  ramping: boolean;
  window: WindowReport | null;
  overall: WindowReport | null;
}

export function reportGoal(
  goal: GoalConfig,
  lookup: DayLookup,
  today: ISODate,
): GoalReport {
  const { target, warning, ramping } = effectiveTargets(goal, today);
  const build = (label: string, range: DateRange | null) =>
    range
      ? buildWindow(goal, lookup, today, label, range, target, warning)
      : null;

  return {
    goal,
    target,
    warning,
    ramping,
    window: build(windowLabel(goal), windowRange(goal, today)),
    overall: build("Overall", overallRange(goal, today)),
  };
}

function buildWindow(
  goal: GoalConfig,
  lookup: DayLookup,
  today: ISODate,
  label: string,
  range: DateRange,
  target: number,
  warning: number,
): WindowReport {
  const stats = computeStats(goal, lookup, today, range);
  return {
    label,
    range,
    stats,
    status: statusFor(goal, stats, target, warning),
  };
}

function statusFor(
  goal: GoalConfig,
  stats: Stats,
  target: number,
  warning: number,
): Status {
  if (stats.rate === null || stats.scheduled < goal.minSamples) {
    return "collecting";
  }
  if (stats.scheduled < goal.minStatusSamples) {
    return "neutral";
  }
  if (stats.rate >= target) {
    return "good";
  }
  return stats.rate >= warning ? "warn" : "bad";
}

/**
 * During a ramp the target climbs linearly from `ramp.from` to the full
 * target, and the warning threshold keeps its original gap below it.
 */
export function effectiveTargets(goal: GoalConfig, today: ISODate) {
  if (!goal.ramp) {
    return { target: goal.target, warning: goal.warning, ramping: false };
  }
  const progress = Math.min(
    1,
    Math.max(0, diffDays(goal.start, today) / (goal.ramp.weeks * 7)),
  );
  const target = progress >= 1
    ? goal.target
    : goal.ramp.from + (goal.target - goal.ramp.from) * progress;
  return {
    target,
    warning: Math.max(0, target - (goal.target - goal.warning)),
    ramping: progress < 1,
  };
}

function windowLabel(goal: GoalConfig): string {
  switch (goal.window.kind) {
    case "overall":
      return "Overall";
    case "calendar-month":
      return "This month";
    case "rolling":
      return `Last ${goal.window.days} days`;
  }
}

/** Dates the goal has been live for, up to today. */
export function overallRange(
  goal: GoalConfig,
  today: ISODate,
): DateRange | null {
  const to = goal.end ? minDate(today, goal.end) : today;
  return goal.start <= to ? { from: goal.start, to } : null;
}

/** The reporting window, anchored on the last day the goal was live. */
export function windowRange(
  goal: GoalConfig,
  today: ISODate,
): DateRange | null {
  const overall = overallRange(goal, today);
  if (!overall) {
    return null;
  }

  let from: ISODate;
  switch (goal.window.kind) {
    case "overall":
      from = overall.from;
      break;
    case "calendar-month":
      from = monthStart(overall.to);
      break;
    case "rolling":
      from = addDays(overall.to, -(goal.window.days - 1));
      break;
  }

  return {
    from: maxDate(from, overall.from),
    to: goal.window.kind === "calendar-month"
      ? minDate(overall.to, monthEnd(overall.to))
      : overall.to,
  };
}

export function computeStats(
  goal: GoalConfig,
  lookup: DayLookup,
  today: ISODate,
  range: DateRange,
): Stats {
  const totals = goal.frequency.kind === "perWeek"
    ? weeklyTotals(goal, lookup, today, range, goal.frequency.count)
    : dailyTotals(goal, lookup, today, range);

  return {
    ...totals,
    rate: totals.scheduled > 0 ? totals.completed / totals.scheduled : null,
  };
}

function isPaused(goal: GoalConfig, date: ISODate): boolean {
  return goal.pause.some((pause) => date >= pause.from && date <= pause.to);
}

function isScheduledDay(goal: GoalConfig, date: ISODate): boolean {
  if (isPaused(goal, date)) {
    return false;
  }
  return goal.frequency.kind !== "weekdays" ||
    goal.frequency.days.includes(weekdayIndex(date));
}

/**
 * Daily and weekday goals. A scheduled day counts as a miss unless it has a
 * completed task, including when the day has no note at all. A cancelled task
 * excuses the day, and today stays pending until it is done.
 */
function dailyTotals(
  goal: GoalConfig,
  lookup: DayLookup,
  today: ISODate,
  range: DateRange,
) {
  let completed = 0;
  let scheduled = 0;

  for (const date of datesBetween(range.from, range.to)) {
    if (!isScheduledDay(goal, date)) {
      continue;
    }
    const record = lookup(date);
    if (record?.completed) {
      completed++;
      scheduled++;
    } else if (record?.cancelled || date === today) {
      continue;
    } else {
      scheduled++;
    }
  }

  return { completed, scheduled };
}

/**
 * "N per week" goals. Each Monday-based week owes `count` completions, and
 * which days they fall on does not matter. Weeks cut by the window or goal
 * boundaries, or reduced by pauses, owe a proportional quota. The current
 * week is not a miss while the quota is still reachable.
 */
function weeklyTotals(
  goal: GoalConfig,
  lookup: DayLookup,
  today: ISODate,
  range: DateRange,
  count: number,
) {
  let completed = 0;
  let scheduled = 0;

  for (
    let start = weekStart(range.from);
    start <= range.to;
    start = addDays(start, 7)
  ) {
    const isCurrentWeek = today >= start && today <= addDays(start, 6);
    const scopeFrom = maxDate(start, range.from);
    let scopeTo = minDate(addDays(start, 6), range.to);
    if (isCurrentWeek) {
      // The current week may still be completed, so judge it on the full week.
      scopeTo = minDate(addDays(start, 6), goal.end ?? addDays(start, 6));
    }

    const available = datesBetween(scopeFrom, scopeTo)
      .filter((date) => !isPaused(goal, date));
    const quota = available.length >= 7
      ? count
      : Math.round((available.length * count) / 7);
    if (quota === 0) {
      continue;
    }

    const done = available
      .filter((date) => date <= range.to && lookup(date)?.completed)
      .length;

    if (!isCurrentWeek) {
      scheduled += quota;
      completed += Math.min(done, quota);
    } else if (done >= quota) {
      scheduled += quota;
      completed += quota;
    } else {
      const remaining = available.filter((date) => date > today).length;
      if (done + remaining >= quota) {
        // Still reachable: only what has been done so far counts.
        scheduled += done;
        completed += done;
      } else {
        scheduled += quota;
        completed += done;
      }
    }
  }

  return { completed, scheduled };
}
