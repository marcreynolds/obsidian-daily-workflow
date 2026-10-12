import { moment as obsidianMoment } from "obsidian";

interface Moment {
  isValid(): boolean;
  format(format: string): string;
}

/** Obsidian's bundled moment, typed for the calls this plugin makes. */
export const moment = obsidianMoment as unknown as (
  value?: string,
  format?: string,
  strict?: boolean,
) => Moment;
