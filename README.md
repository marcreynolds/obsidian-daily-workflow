# Daily Workflow

A private Obsidian plugin for daily-note workflow utilities.

## Daily header

Add this block to a daily-note template:

````markdown
```daily-header
```
````

The header uses the file name to render the current date and links to the
nearest dated notes in the configured daily-notes folder. It does not use
Dataview or a periodic refresh, so it has a stable layout while editing.

## Development

```sh
npm install
npm run dev
```

Build release assets with `npm run build`. A BRAT release must include
`main.js`, `manifest.json`, and `styles.css`.
