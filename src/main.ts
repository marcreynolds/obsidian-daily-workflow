import {
  App,
  Modal,
  Notice,
  normalizePath,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  moment as obsidianMoment,
} from "obsidian";
import type { Moment } from "moment";
import { GoalTrackerView } from "./goals/view";

interface DailyDate {
  isAfter(date: DailyDate): boolean;
  isBefore(date: DailyDate): boolean;
  isValid(): boolean;
  format(format: string): string;
  valueOf(): number;
}

type ParseDate = (value: string, format: string, strict: boolean) => DailyDate;

const parseDate = obsidianMoment as unknown as ParseDate;
const moment = obsidianMoment as unknown as (value?: string, format?: string, strict?: boolean) => Moment;

interface DailyWorkflowSettings {
  dailyNotesFolderOverride: string;
  dateFormat: string;
}

interface DailyNotesSettings {
  folder?: unknown;
}

const DEFAULT_SETTINGS: DailyWorkflowSettings = {
  dailyNotesFolderOverride: "",
  dateFormat: "YYYY-MM-DD",
};

export default class DailyWorkflowPlugin extends Plugin {
  declare settings: DailyWorkflowSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addRibbonIcon("calendar-plus", "Open daily note for date", () => new DailyDateModal(this.app).open());
    this.addCommand({ id: "open-daily-note-for-date", name: "Open daily note for date", callback: () => new DailyDateModal(this.app).open() });
    this.addSettingTab(new DailyWorkflowSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor(
      "daily-header",
      async (_source, container, context) => {
        const file = this.app.vault.getFileByPath(context.sourcePath);
        const dailyNotesFolder = await this.dailyNotesFolder();

        if (!file || !dailyNotesFolder) {
          container.createEl("em", {
            text: "Daily header: configure the core Daily notes folder.",
          });
          return;
        }

        this.renderDailyHeader(container, file, dailyNotesFolder);
      },
    );
    this.registerMarkdownCodeBlockProcessor(
      "goal-tracker",
      (source, container, context) => {
        context.addChild(new GoalTrackerView(container, source, {
          app: this.app,
          dailyFiles: async () => {
            const folder = await this.dailyNotesFolder();
            return folder ? this.dailyFiles(folder) : undefined;
          },
          dateFormat: () => this.settings.dateFormat,
        }));
      },
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private renderDailyHeader(
    container: HTMLElement,
    currentFile: TFile,
    dailyNotesFolder: string,
  ): void {
    const currentDate = parseDate(
      currentFile.basename,
      this.settings.dateFormat,
      true,
    );

    if (!currentDate.isValid()) {
      container.createEl("em", {
        text: "Daily header: could not parse a date from this file's name.",
      });
      return;
    }

    const header = container.createDiv({ cls: "daily-workflow-header" });
    const dailyFiles = this.dailyFiles(dailyNotesFolder);
    const previousFile = this.adjacentFile(dailyFiles, currentDate, -1);
    const nextFile = this.adjacentFile(dailyFiles, currentDate, 1);

    this.createLink(
      header,
      previousFile,
      currentFile.path,
      previousFile ? `← ${previousFile.basename}` : "← Previous",
      "daily-workflow-header__previous",
    );
    header.createDiv({
      cls: "daily-workflow-header__date",
      text: currentDate.format("dddd, MMMM D, YYYY"),
    });
    this.createLink(
      header,
      nextFile,
      currentFile.path,
      nextFile ? `${nextFile.basename} →` : "Next →",
      "daily-workflow-header__next",
    );
  }

  async dailyNotesFolder(): Promise<string | undefined> {
    const override = this.settings.dailyNotesFolderOverride.replace(/\/$/, "");

    if (override) {
      return override;
    }

    try {
      const path = `${this.app.vault.configDir}/daily-notes.json`;
      const contents = await this.app.vault.adapter.read(path);
      const settings = JSON.parse(contents) as DailyNotesSettings;

      if (typeof settings.folder !== "string") {
        return undefined;
      }

      return settings.folder.replace(/\/$/, "") || undefined;
    } catch {
      return undefined;
    }
  }

  dailyFiles(folder: string): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) =>
      file.path.startsWith(`${folder}/`),
    );
  }

  private adjacentFile(
    dailyFiles: TFile[],
    currentDate: DailyDate,
    direction: -1 | 1,
  ): TFile | undefined {
    return dailyFiles
      .map((file) => ({
        date: parseDate(file.basename, this.settings.dateFormat, true),
        file,
      }))
      .filter(({ date }) => date.isValid() && (direction < 0
        ? date.isBefore(currentDate)
        : date.isAfter(currentDate)))
      .sort((left, right) => direction < 0
        ? right.date.valueOf() - left.date.valueOf()
        : left.date.valueOf() - right.date.valueOf())[0]
      ?.file;
  }

  private createLink(
    container: HTMLElement,
    target: TFile | undefined,
    sourcePath: string,
    text: string,
    className: string,
  ): void {
    const link = container.createEl(target ? "a" : "span", {
      cls: className,
      text,
    });

    if (!target) {
      return;
    }

    const linktext = this.app.metadataCache.fileToLinktext(target, sourcePath);
    link.addClass("internal-link");
    link.setAttribute("data-href", linktext);
    link.setAttribute("href", linktext);
  }
}

class DailyWorkflowSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DailyWorkflowPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Daily notes folder override")
      .setDesc("Leave empty to use the core Daily notes setting.")
      .addText((text) => text
        .setPlaceholder("Use core Daily notes setting")
        .setValue(this.plugin.settings.dailyNotesFolderOverride)
        .onChange(async (value) => {
          this.plugin.settings.dailyNotesFolderOverride = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Date format")
      .setDesc("Moment format used by the daily-note file names.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.dateFormat)
        .setValue(this.plugin.settings.dateFormat)
        .onChange(async (value) => {
          this.plugin.settings.dateFormat = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}


class DailyDateModal extends Modal {
  onOpen(): void {
    this.titleEl.setText("Open daily note for date");
    const form = this.contentEl.createEl("form", { cls: "daily-workflow-date-form" });
    const label = form.createEl("label", { text: "Choose a date" });
    const input = label.createEl("input", { type: "date" });
    input.value = moment().format("YYYY-MM-DD");
    const button = form.createEl("button", { text: "Open or create note", type: "submit", cls: "mod-cta" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const date = moment(input.value, "YYYY-MM-DD", true);
      if (!date.isValid()) { new Notice("Choose a valid date."); return; }
      button.disabled = true;
      try {
        await openDailyNote(this.app, date);
        this.close();
      } catch (error) {
        console.error("Daily Workflow: unable to open daily note", error);
        new Notice(`Unable to open daily note: ${error instanceof Error ? error.message : String(error)}`);
        button.disabled = false;
      }
    });
    input.focus();
  }

  onClose(): void { this.contentEl.empty(); }
}

async function openDailyNote(app: App, date: Moment): Promise<void> {
  // Obsidian's core plugin stores its folder, format, and template in this file.
  const path = `${app.vault.configDir}/daily-notes.json`;
  let settings: { folder?: string; format?: string; template?: string } = {};
  if (await app.vault.adapter.exists(path)) settings = JSON.parse(await app.vault.adapter.read(path));
  const format = settings.format || "YYYY-MM-DD";
  const name = date.format(format);
  const notePath = normalizePath(`${settings.folder || ""}/${name}.md`);
  let file = app.vault.getAbstractFileByPath(notePath);
  if (file && !(file instanceof TFile)) throw new Error("The note path is occupied by a folder.");
  if (!file) {
    let content = "";
    if (settings.template) {
      const template = app.metadataCache.getFirstLinkpathDest(settings.template, "");
      if (!template) throw new Error(`Daily note template not found: ${settings.template}`);
      content = await app.vault.cachedRead(template);
      const now = moment();
      content = content.replace(/{{\s*date\s*}}/gi, name)
        .replace(/{{\s*title\s*}}/gi, name)
        .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
        .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_match, _kind: string, calc: string, delta: string, unit: string, fmt: string) => {
          const value = date.clone().set({ hour: now.hour(), minute: now.minute(), second: now.second() });
          if (calc) value.add(parseInt(delta, 10), unit as import("moment").unitOfTime.DurationConstructor);
          return value.format(fmt ? fmt.substring(1).trim() : format);
        })
        .replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(format))
        .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "day").format(format));
    }
    const parts = notePath.split("/");
    parts.pop();
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
    }
    try { file = await app.vault.create(notePath, content); }
    catch (error) {
      file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) throw error;
    }
  }
  await app.workspace.getLeaf(false).openFile(file as TFile);
}
