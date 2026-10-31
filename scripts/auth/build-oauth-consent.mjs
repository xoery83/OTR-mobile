import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
const browserRequire = createRequire(resolve("browser/auth-consent/package.json"));
await build({
  entryPoints: ["browser/auth-consent/main.tsx"],
  outfile: "dist/auth-consent/app.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  target: ["safari16", "chrome110"],
  jsx: "automatic",
  alias: {
    "@": resolve("src"),
    "react-native": resolve(
      dirname(browserRequire.resolve("react-native-web/package.json")),
      "dist/index.js",
    ),
    react: dirname(browserRequire.resolve("react/package.json")),
    "react-dom": dirname(browserRequire.resolve("react-dom/package.json")),
  },
  define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
});
