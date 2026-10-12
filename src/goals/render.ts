import { GoalReport, Status, WindowReport } from "./engine";

const STATUS_ICON: Record<Status, string> = {
  collecting: "⚪",
  neutral: "⚪",
  good: "🟢",
  warn: "🟡",
  bad: "🔴",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function counts(window: WindowReport): string {
  return `${window.stats.completed}/${window.stats.scheduled}`;
}

function windowText(window: WindowReport | null): string {
  if (!window) {
    return "—";
  }
  const { rate } = window.stats;
  if (window.status === "collecting" || rate === null) {
    return `⚪ Collecting data… (${counts(window)})`;
  }
  return `${STATUS_ICON[window.status]} ${percent(rate)} (${counts(window)})`;
}

function overallText(window: WindowReport | null): string {
  const rate = window?.stats.rate;
  return window && rate != null ? `${percent(rate)} (${counts(window)})` : "—";
}

function targetText(report: GoalReport): string {
  if (!report.ramping) {
    return `≥ ${percent(report.target)}`;
  }
  return `≥ ${percent(report.target)} → ${percent(report.goal.target)}`;
}

function frequencyText(report: GoalReport): string {
  const { frequency } = report.goal;
  switch (frequency.kind) {
    case "daily":
      return "daily";
    case "perWeek":
      return `${frequency.count}/week`;
    case "weekdays":
      return frequency.days
        .map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day])
        .join(" ");
  }
}

export function renderReports(
  container: HTMLElement,
  reports: GoalReport[],
  errors: string[],
): void {
  container.empty();

  for (const error of errors) {
    container.createEl("p", {
      cls: "goal-tracker__error",
      text: `Goal tracker: ${error}`,
    });
  }
  if (reports.length === 0) {
    return;
  }

  const wrapper = container.createDiv({ cls: "goal-tracker" });
  const table = wrapper.createEl("table");
  const head = table.createEl("thead").createEl("tr");
  const windowLabels = [...new Set(reports.map((r) => r.window?.label))];
  const windowHeading = windowLabels.length === 1 && windowLabels[0]
    ? windowLabels[0]
    : "Recent";

  for (const heading of ["Goal", "Target", windowHeading, "Overall"]) {
    head.createEl("th", { text: heading });
  }

  const body = table.createEl("tbody");
  for (const report of reports) {
    const row = body.createEl("tr");
    const goalCell = row.createEl("td");
    goalCell.createSpan({ text: report.goal.label });
    goalCell.createSpan({
      cls: "goal-tracker__frequency",
      text: ` · ${frequencyText(report)}`,
    });
    row.createEl("td", { text: targetText(report) });

    const windowCell = row.createEl("td", { text: windowText(report.window) });
    if (report.window) {
      windowCell.addClass(`goal-tracker__status-${report.window.status}`);
      windowCell.setAttribute(
        "title",
        `${report.window.range.from} to ${report.window.range.to}`,
      );
    }
    row.createEl("td", { text: overallText(report.overall) });
  }
}
