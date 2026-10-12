# Daily Workflow

A private Obsidian plugin for daily-note workflow utilities.

## Daily header

Add this block to a daily-note template:

````markdown
```daily-header
```
````

The header uses the file name to render the current date and links to the
nearest dated notes in the folder configured by Obsidian's core Daily notes
plugin. It does not use Dataview or a periodic refresh, so it has a stable
layout while editing. An optional plugin setting can override that folder.

## Goal tracker

Track how consistently a tagged daily-note task gets done. Put a `goal-tracker`
block anywhere, usually in the goal's own note. It takes one goal or a list:

````markdown
```goal-tracker
- label: 💊 Fin/min
  tag: "#habit/hair/finmin"
  start: 2026-09-13
  end: 2027-03-13
  frequency: daily
  target: 90%
  warning: 80%
  window: rolling-30d
```
````

A goal counts a day as done when that daily note has a completed task
containing the tag. The tag must be quoted, since `#` starts a YAML comment.

| Key | Meaning |
| --- | --- |
| `tag`, `start` | Required. |
| `label` | Display name. Defaults to the tag. |
| `end` | Last day of the goal. Reporting stops there. |
| `frequency` | `daily` (default), `3/week` (any 3 days per Monday-based week), or weekdays such as `[mon, wed, fri]`. |
| `target`, `warning` | Green at or above `target`, yellow at or above `warning`, red below. Defaults 90% and target minus 10 points. |
| `window` | `rolling-30d` (default), `calendar-month`, or `overall`. Rolling windows never reset, so there is no failure spike on the 1st. |
| `min-samples` | Below this many scheduled occurrences, show counts instead of a percent (default 5). |
| `min-status-samples` | Below this many, show the percent without a color (default 7). |
| `ramp` | `{ weeks: 4, from: 70% }` raises the target gradually from `from` to `target`. |
| `pause` | Ranges excused entirely, e.g. `["2026-11-01..2026-11-07"]`. |

On a daily or weekday goal, a scheduled day with no completed task is a miss,
including a day with no note at all. A task marked `[-]` excuses that day, and
today stays pending until it is done. On a `N/week` goal the current week is
only a miss once its quota can no longer be reached. Weeks cut short by the
goal start or end or by a pause owe a proportional quota.

## Development

```sh
npm install
npm run dev
npm test
```

Build release assets with `npm run build`. A BRAT release must include
`main.js`, `manifest.json`, and `styles.css`.
