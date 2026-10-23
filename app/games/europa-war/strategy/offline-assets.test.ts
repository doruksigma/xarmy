import assert from "node:assert/strict";
import { test } from "node:test";
import { collectOfflinePageAssets } from "./offline-assets";

const origin = "https://game.example";
const layout = "/_next/static/chunks/app/layout-current.js";
const route = "/_next/static/chunks/app/games/europa-war/page-current.js";
const style = "/_next/static/css/current.css";

test("Geç başlayan çevrimdışı hazırlık silinmiş script etiketlerini yükleme geçmişinden tamamlar", () => {
  const initialDOM = [layout, style];
  const currentDOM = [style]; // Next removed the executed layout script.
  const resources = [
    { name: origin + layout },
    { name: origin + route }, // Route script was removed before the hook mounted.
    { name: origin + style },
    { name: origin + "/_next/static/chunks/late-shared.js?build=current" },
  ];
  assert.deepEqual(
    collectOfflinePageAssets(origin, [...initialDOM, ...currentDOM], resources),
    [
      origin + layout,
      origin + style,
      origin + route,
      origin + "/_next/static/chunks/late-shared.js?build=current",
    ],
  );
});

test("Çevrimdışı sayfa listesi aynı kökenden Next varlıklarını tekilleştirir ve ilgisiz yüklemeleri dışlar", () => {
  const font = "/_next/static/media/game.woff2";
  assert.deepEqual(
    collectOfflinePageAssets(
      origin,
      [
        font,
        style,
        origin + style,
        "https://cdn.example/_next/static/app.js",
        "https://[",
      ],
      [
        { name: origin + style },
        { name: origin + route },
        { name: "https://other.example/_next/static/chunks/app.js" },
        { name: origin + "/api/session.js" },
        { name: origin + "/_next/static/data/world.json" },
        { name: origin + "/_next/static/media/unrelated.webp" },
        { name: "data:text/javascript,alert(1)" },
      ],
    ),
    [origin + font, origin + style, origin + route],
  );
});
