import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGoals } from "../src/goals/config";
import {
  computeStats,
  DayLookup,
  DayRecord,
  reportGoal,
  windowRange,
} from "../src/goals/engine";

function goal(yaml: Record<string, unknown>) {
  const { goals, errors } = parseGoals({
    tag: "#habit/x",
    start: "2026-09-13",
    ...yaml,
  });
  assert.deepEqual(errors, []);
  return goals[0];
}

function notes(entries: Record<string, Partial<DayRecord>>): DayLookup {
  return (date) =>
    entries[date] && { completed: false, cancelled: false, ...entries[date] };
}

const done = { completed: true };

function counts(stats: { completed: number; scheduled: number }) {
  return [stats.completed, stats.scheduled];
}

test("daily: missing notes and unchecked tasks are misses; today is pending", () => {
  const g = goal({});
  const lookup = notes({ "2026-09-13": done, "2026-09-14": {}, "2026-09-16": done });
  // 13 done, 14 unchecked, 15 no note, 16 done, 17 is today and pending.
  const stats = computeStats(g, lookup, "2026-09-17", { from: "2026-09-13", to: "2026-09-17" });
  assert.deepEqual(counts(stats), [2, 4]);
});

test("daily: today counts once completed", () => {
  const g = goal({});
  const stats = computeStats(g, notes({ "2026-09-13": done }), "2026-09-13", { from: "2026-09-13", to: "2026-09-13" });
  assert.deepEqual(counts(stats), [1, 1]);
});

test("cancelled tasks and pauses are excused", () => {
  const g = goal({ pause: ["2026-09-15..2026-09-16"] });
  const lookup = notes({ "2026-09-13": done, "2026-09-14": { cancelled: true } });
  const stats = computeStats(g, lookup, "2026-09-20", { from: "2026-09-13", to: "2026-09-17" });
  // 13 done, 14 excused, 15 and 16 paused, 17 missed.
  assert.deepEqual(counts(stats), [1, 2]);
});

test("weekdays only schedule the listed days", () => {
  const g = goal({ frequency: ["mon", "wed"] });
  // 2026-09-14 is a Monday and 09-16 a Wednesday.
  const stats = computeStats(g, notes({ "2026-09-14": done }), "2026-09-20", { from: "2026-09-14", to: "2026-09-20" });
  assert.deepEqual(counts(stats), [1, 2]);
});

test("per-week: any days satisfy the quota and extras are capped", () => {
  const g = goal({ frequency: "3/week", start: "2026-09-14" });
  const lookup = notes({
    "2026-09-14": done, "2026-09-15": done, "2026-09-16": done, "2026-09-17": done,
    "2026-09-21": done,
  });
  const stats = computeStats(g, lookup, "2026-09-30", { from: "2026-09-14", to: "2026-09-27" });
  assert.deepEqual(counts(stats), [4, 6]);
});

test("per-week: current week is not a miss while the quota is reachable", () => {
  const g = goal({ frequency: "3/week", start: "2026-09-14" });
  // Wednesday with nothing done: Thursday to Sunday still leaves room for 3.
  let stats = computeStats(g, notes({}), "2026-09-16", { from: "2026-09-14", to: "2026-09-16" });
  assert.deepEqual(counts(stats), [0, 0]);
  // Saturday with nothing done: only Sunday remains, so the shortfall is certain.
  stats = computeStats(g, notes({}), "2026-09-19", { from: "2026-09-14", to: "2026-09-19" });
  assert.deepEqual(counts(stats), [0, 3]);
});

test("per-week: a goal starting mid-week owes a prorated quota", () => {
  const g = goal({ frequency: "3/week", start: "2026-09-17" });
  const stats = computeStats(g, notes({}), "2026-09-30", { from: "2026-09-17", to: "2026-09-20" });
  assert.equal(stats.scheduled, 2); // round(4 * 3 / 7)
});

test("rolling window is clipped to the goal's span", () => {
  const g = goal({ window: "rolling-30d", end: "2027-03-13" });
  assert.deepEqual(windowRange(g, "2026-10-12"), { from: "2026-09-13", to: "2026-10-12" });
  assert.deepEqual(windowRange(g, "2026-12-01"), { from: "2026-11-02", to: "2026-12-01" });
  assert.deepEqual(windowRange(g, "2027-04-01"), { from: "2027-02-12", to: "2027-03-13" });
  assert.equal(windowRange(g, "2026-09-01"), null);
});

test("calendar month window starts at the goal start in the first month", () => {
  const g = goal({ window: "calendar-month" });
  assert.deepEqual(windowRange(g, "2026-09-20"), { from: "2026-09-13", to: "2026-09-20" });
  assert.deepEqual(windowRange(g, "2026-10-05"), { from: "2026-10-01", to: "2026-10-05" });
});

test("status gating and target ramp", () => {
  const g = goal({ ramp: { weeks: 4, from: "70%" }, "min-samples": 3, "min-status-samples": 5 });
  const five = notes({
    "2026-09-13": done, "2026-09-14": done, "2026-09-15": done,
    "2026-09-16": done, "2026-09-17": done,
  });
  const early = reportGoal(g, five, "2026-09-18");
  assert.equal(early.overall?.status, "good"); // 5/5
  assert.ok(early.ramping && early.target < 0.9 && early.target >= 0.7);

  assert.equal(reportGoal(g, notes({ "2026-09-13": done }), "2026-09-14").overall?.status, "collecting");

  const three = notes({ "2026-09-13": done, "2026-09-14": done, "2026-09-15": done });
  assert.equal(reportGoal(g, three, "2026-09-17").overall?.status, "neutral"); // percent, no color yet

  const late = reportGoal(g, five, "2026-12-01");
  assert.equal(late.ramping, false);
  assert.equal(late.target, 0.9);
});

test("config validation", () => {
  assert.match(parseGoals({ start: "2026-09-13" }).errors[0], /tag/);
  assert.match(parseGoals({ tag: "#a", start: "nope" }).errors[0], /start/);
  assert.match(parseGoals({ tag: "#a", start: "2026-09-13", frequency: "sometimes" }).errors[0], /frequency/);
  const g = parseGoals({ tag: "A/B", start: "2026-09-13", target: "85%", frequency: "mon, wed" }).goals[0];
  assert.equal(g.tag, "#a/b");
  assert.equal(g.target, 0.85);
  assert.deepEqual(g.frequency, { kind: "weekdays", days: [0, 2] });
  assert.equal(parseGoals([{ tag: "#a", start: "2026-09-13" }, { tag: "#b" }]).errors.length, 1);
});
