import { App, TFile } from "obsidian";
import { DateRange } from "./config";
import { ISODate } from "./dates";
import { DayRecord } from "./engine";
import { moment } from "./moment";

const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]])\]\s+(.*)$/;

export interface DailyNoteSource {
  app: App;
  /** Daily-note files in any order, or undefined when no folder is configured. */
  dailyFiles(): Promise<TFile[] | undefined>;
  dateFormat(): string;
}

/** Records for each tag, keyed by the date of the daily note holding the task. */
export type RecordsByTag = Map<string, Map<ISODate, DayRecord>>;

function tagPattern(tag: string): RegExp {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![\\w/-])${escaped}(?![\\w/-])`, "i");
}

/**
 * Reads the daily notes dated within `range` and collects, per tag, whether a
 * task carrying that tag was completed or cancelled. The note's own date is
 * what counts, not the ✅ completion date, so a task checked off the next
 * morning still belongs to the day it was written on.
 */
export async function loadRecords(
  source: Pick<DailyNoteSource, "app" | "dateFormat">,
  dailyFiles: TFile[],
  tags: string[],
  range: DateRange,
): Promise<RecordsByTag> {
  const patterns = tags.map((tag) => [tag, tagPattern(tag)] as const);
  const records: RecordsByTag = new Map(tags.map((tag) => [tag, new Map()]));
  const format = source.dateFormat();

  const files = dailyFiles.flatMap((file) => {
    const parsed = moment(file.basename, format, true);
    const date = parsed.isValid() ? parsed.format("YYYY-MM-DD") : undefined;
    return date && date >= range.from && date <= range.to
      ? [{ file, date }]
      : [];
  });

  await Promise.all(files.map(async ({ file, date }) => {
    const lines = (await source.app.vault.cachedRead(file)).split("\n");

    for (const line of lines) {
      const task = TASK_LINE.exec(line);
      if (!task) {
        continue;
      }
      const [, mark, text] = task;

      for (const [tag, pattern] of patterns) {
        if (!pattern.test(text)) {
          continue;
        }
        const byDate = records.get(tag)!;
        const record = byDate.get(date) ??
          { completed: false, cancelled: false };
        record.completed ||= mark.toLowerCase() === "x";
        record.cancelled ||= mark === "-";
        byDate.set(date, record);
      }
    }
  }));

  return records;
}
