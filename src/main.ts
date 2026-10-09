import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  moment as obsidianMoment,
} from "obsidian";

interface DailyDate {
  isAfter(date: DailyDate): boolean;
  isBefore(date: DailyDate): boolean;
  isValid(): boolean;
  format(format: string): string;
  valueOf(): number;
}

type ParseDate = (value: string, format: string, strict: boolean) => DailyDate;

const parseDate = obsidianMoment as unknown as ParseDate;

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

  private async dailyNotesFolder(): Promise<string | undefined> {
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

  private dailyFiles(folder: string): TFile[] {
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
