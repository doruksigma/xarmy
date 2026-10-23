import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP, createWorld } from "./world";
import { minimapBitmap, minimapPixelRatio, minimapSignature } from "./minimap";

const indexOf = (country: string) =>
  MAP.provinces.findIndex((province) => province.country === country);

test("Mini harita imzası gün ve ekonomi güncellemelerinde değişmez", () => {
  const world = createWorld("germany");
  world.countries.germany.wars = ["poland", "france"];
  world.countries.germany.allies = ["italy", "hungary"];
  const before = minimapSignature(world);
  world.day += 20;
  world.seed += 1;
  world.countries.germany.treasury += 100;
  world.countries.germany.wars.reverse();
  world.countries.germany.allies.reverse();
  assert.equal(minimapSignature(world), before);
  assert.equal(before.length, MAP.provinces.length);
});

test("Şehir kontrolü değişince sadece o şehrin mini harita rengi değişir", () => {
  const world = createWorld("germany"),
    index = indexOf("poland"),
    province = MAP.provinces[index];
  world.countries.germany.wars = ["poland"];
  const before = minimapSignature(world);
  assert.equal(
    before[index],
    "1",
    "Savaştaki ülkenin şehri düşman rengindedir",
  );
  world.provinces[province.id].controller = "germany";
  const after = minimapSignature(world);
  assert.equal(after[index], "0", "Ele geçirilen şehir oyuncunun rengini alır");
  assert.deepEqual(
    [...before].flatMap((color, i) => (color !== after[i] ? [i] : [])),
    [index],
  );
});

test("Savaş, ittifak ve oyuncu değişikliği mini harita renklerini yeniler", () => {
  const world = createWorld("germany"),
    german = indexOf("germany"),
    polish = indexOf("poland"),
    italian = indexOf("italy");
  world.countries.germany.wars = ["poland"];
  world.countries.germany.allies = ["italy", "poland"];
  let signature = minimapSignature(world);
  assert.equal(signature[german], "0");
  assert.equal(
    signature[polish],
    "1",
    "Savaş rengi ittifak rengine önceliklidir",
  );
  assert.equal(signature[italian], "2");
  world.countries.germany.wars = [];
  signature = minimapSignature(world);
  assert.equal(signature[polish], "2");
  world.countries.germany.allies = [];
  signature = minimapSignature(world);
  assert.equal(signature[polish], "3");
  assert.equal(signature[italian], "3");
  world.player = "poland";
  assert.equal(minimapSignature(world)[polish], "0");
});

test("Mini harita DOM olmadan SVG yedeğine döner ve raster çözünürlüğü sınırlıdır", () => {
  assert.equal(minimapBitmap(minimapSignature(createWorld("turkey")), 2), null);
  assert.equal(minimapPixelRatio(3), 3);
  assert.equal(minimapPixelRatio(100), 4);
  assert.equal(minimapPixelRatio(Number.NaN), 1);
});
