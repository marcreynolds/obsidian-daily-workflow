import esbuild from "esbuild";
import process from "node:process";

const production = process.argv[2] === "production";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  sourcemap: production ? false : "inline",
  target: "es2022",
  logLevel: "info",
  outfile: "main.js",
  minify: production,
});
