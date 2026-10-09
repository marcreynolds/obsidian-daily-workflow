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
  dailyNotesFolder: string;
  dateFormat: string;
}

const DEFAULT_SETTINGS: DailyWorkflowSettings = {
  dailyNotesFolder: "03 Daily Notes",
  dateFormat: "YYYY-MM-DD",
};

export default class DailyWorkflowPlugin extends Plugin {
  declare settings: DailyWorkflowSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new DailyWorkflowSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor(
      "daily-header",
      (_source, container, context) => {
        const file = this.app.vault.getFileByPath(context.sourcePath);

        if (file) {
          this.renderDailyHeader(container, file);
        }
      },
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private renderDailyHeader(container: HTMLElement, currentFile: TFile): void {
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
    const dailyFiles = this.dailyFiles();
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

  private dailyFiles(): TFile[] {
    const folder = this.settings.dailyNotesFolder.replace(/\/$/, "");

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
      .setName("Daily notes folder")
      .setDesc("Folder containing the dated daily notes.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.dailyNotesFolder)
        .setValue(this.plugin.settings.dailyNotesFolder)
        .onChange(async (value) => {
          this.plugin.settings.dailyNotesFolder = value.trim();
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
