import assert from "node:assert/strict";
import { test } from "node:test";
import map from "./map-data.json";
import europe from "../../../../scripts/europa-war/europe-1936-base.json";

const provinces = new Map(map.provinces.map((province) => [province.id, province]));
const countries = new Map(map.countries.map((country) => [country.id, country]));
const legacyIds = new Set(europe.provinces.map((province) => province.id));

test("the 1936 world provides playable capitals across all inhabited continents", () => {
  assert.equal(map.scenario, "world-1936-v1");
  for (const id of [
    "usa", "canada", "mexico", "brazil", "argentina", "chile",
    "china", "japan", "mongolia", "tibet", "iran", "siam",
    "egypt", "ethiopia", "liberia", "southafrica", "australia", "newzealand",
    "andorra", "monaco", "sanmarino", "vatican", "liechtenstein", "iceland",
  ]) {
    const country = countries.get(id);
    assert.ok(country, `${id} must be selectable`);
    const capital = provinces.get(country.capital);
    assert.equal(capital?.country, id, `${id} must own its capital`);
    assert.ok(!capital.initialController || capital.initialController === id);
  }
  assert.ok(provinces.get("usa-16")!.lon < -120);
  assert.ok(provinces.get("japan-0")!.lon > 130);
  assert.ok(provinces.get("australia-1")!.lat < -30);
  assert.ok(provinces.get("brazil-0")!.lat < -20);
});

test("European province identities, marching distances and existing edges survive world expansion", () => {
  for (const old of europe.provinces) {
    const current = provinces.get(old.id);
    assert.ok(current, old.id);
    assert.ok(Math.abs(current.x - old.x - 2325) < 0.01, old.id);
    assert.ok(Math.abs(current.y - old.y - 286) < 0.01, old.id);
    assert.deepEqual(
      current.neighbors.filter((edge) => legacyIds.has(edge.id)),
      old.neighbors,
      `Existing European routes must not be replaced: ${old.id}`,
    );
  }
  assert.equal(countries.get("iceland")!.capital, "denmark-2");
});

test("dependent territories use 1936 administrations and the strategic canals have separate regions", () => {
  for (const [id, parent] of [
    ["india", "uk"], ["malaya", "uk"], ["brunei", "uk"],
    ["indochina", "france"], ["eastindies", "netherlands"],
    ["philippines", "usa"], ["manchukuo", "japan"],
  ]) assert.equal(countries.get(id)!.initialSubjectOf, parent);
  assert.equal(provinces.get("egypt-2")!.initialController, "uk");
  assert.equal(provinces.get("usa-global-panama-canal")!.country, "usa");
  assert.equal(provinces.get("panama-0")!.country, "panama");
  assert.equal(provinces.get("uk-global-gibraltar")!.country, "uk");
});

test("global routes are symmetric and landlocked states receive no invented naval bases", () => {
  for (const province of provinces.values()) {
    assert.ok(province.x >= 0 && province.x <= map.width);
    assert.ok(province.y >= 0 && province.y <= map.height);
    assert.equal(new Set(province.neighbors.map((edge) => edge.id)).size, province.neighbors.length);
    for (const edge of province.neighbors) {
      assert.notEqual(edge.id, province.id);
      const destination = provinces.get(edge.id);
      assert.ok(destination, `${province.id} → ${edge.id}`);
      assert.ok(destination.neighbors.some((reverse) => reverse.id === province.id && reverse.sea === edge.sea));
      if (edge.sea && (!legacyIds.has(province.id) || !legacyIds.has(edge.id))) {
        assert.ok(province.port && destination.port, `${province.id} → ${edge.id} requires real ports`);
      }
    }
    if (["nepal", "bhutan", "afghanistan", "tibet", "mongolia", "tannutuva", "bolivia", "paraguay", "andorra", "sanmarino", "vatican", "liechtenstein"].includes(province.country)) {
      assert.equal(province.port, false, province.id);
    }
  }
  assert.equal(provinces.get("egypt-0")!.port, false);
  assert.equal(provinces.get("uk-global-20")!.port, false, "Maseru is landlocked");
  assert.equal(provinces.get("usa-9")!.seaZone, "caribbean");
  assert.equal(provinces.get("usa-16")!.seaZone, "northPacific");
  assert.equal(provinces.get("ussr-9")!.seaZone, "arctic");
});
