// Render our static vector decoration once instead of repainting hundreds of
// clipped patterns on every pointer movement. Uses Next's installed Sharp.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
require.extensions[".tsx"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const { TerrainAtlas } = require("./terrain-source.tsx");
const root = path.resolve(__dirname, "../..");
(async () => {
  const svg = renderToStaticMarkup(React.createElement(TerrainAtlas));
  const hash = crypto
    .createHash("sha256")
    .update(svg)
    .digest("hex")
    .slice(0, 12);
  const url = `/games/europa-war/terrain-${hash}.webp`;
  const output = path.join(root, "public", url);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await sharp(Buffer.from(svg))
    .webp({ quality: 86, alphaQuality: 100, effort: 5 })
    .toFile(output);
  const meta = await sharp(output).metadata();
  fs.writeFileSync(
    path.join(root, "app/games/europa-war/strategy/map-assets.json"),
    JSON.stringify(
      {
        terrain: {
          url,
          width: meta.width,
          height: meta.height,
          sourceHash: hash,
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      url,
      width: meta.width,
      height: meta.height,
      bytes: fs.statSync(output).size,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
