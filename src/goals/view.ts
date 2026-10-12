import { debounce, MarkdownRenderChild, parseYaml } from "obsidian";
import { parseGoals } from "./config";
import { reportGoal } from "./engine";
import { moment } from "./moment";
import { renderReports } from "./render";
import { DailyNoteSource, loadRecords } from "./source";

/** Renders a `goal-tracker` code block and keeps it current as notes change. */
export class GoalTrackerView extends MarkdownRenderChild {
  private generation = 0;
  private readonly refresh = debounce(() => void this.render(), 400, true);

  constructor(
    container: HTMLElement,
    private readonly source: string,
    private readonly notes: DailyNoteSource,
  ) {
    super(container);
  }

  onload(): void {
    void this.render();
    this.registerEvent(
      this.notes.app.vault.on("modify", async (file) => {
        const files = await this.notes.dailyFiles();
        if (files?.some((daily) => daily.path === file.path)) {
          this.refresh();
        }
      }),
    );
  }

  private async render(): Promise<void> {
    const generation = ++this.generation;
    let raw: unknown;
    try {
      raw = parseYaml(this.source);
    } catch (error) {
      renderReports(this.containerEl, [], [`invalid YAML: ${String(error)}`]);
      return;
    }

    const dailyFiles = await this.notes.dailyFiles();
    if (!dailyFiles) {
      renderReports(this.containerEl, [], [
        "configure the core Daily notes folder (or the override in Daily Workflow settings).",
      ]);
      return;
    }

    const { goals, errors } = parseGoals(raw);
    const today = moment().format("YYYY-MM-DD");
    const from = goals.map((goal) => goal.start).sort()[0];

    const records = goals.length > 0
      ? await loadRecords(this.notes, dailyFiles, goals.map((goal) => goal.tag), {
        from,
        to: today,
      })
      : new Map();

    if (generation !== this.generation) {
      return; // a newer render superseded this one
    }

    const reports = goals.map((goal) =>
      reportGoal(goal, (date) => records.get(goal.tag)?.get(date), today));
    renderReports(this.containerEl, reports, errors);
  }
}
