import assert from "node:assert/strict";
import { test } from "node:test";
import { aiDay, chooseAIFocus } from "./ai";
import { createWorld } from "./world";
import { focusTree } from "./catalog";
import {
  countryEvents,
  historicalEvent,
  historicalFocusId,
} from "./historical-catalog";
import { politicsDay } from "./politics";
import { validateWorld } from "./storage";
import type { Country, World } from "./types";

function fixture() {
  const w = createWorld("turkey", "historical", 1923);
  const c = w.countries.germany;
  c.political = 500;
  c.treasury = 5000;
  c.stability = 90;
  c.warSupport = 90;
  c.exhaustion = 0;
  c.wars = [];
  for (const key of Object.keys(c.stock) as (keyof Country["stock"])[])
    c.stock[key] = 1000;
  for (const key of Object.keys(c.equipment) as (keyof Country["equipment"])[])
    c.equipment[key] = 1000;
  for (const army of w.armies.filter((army) => army.country === c.id))
    army.supply = 1;
  return { w, c };
}
function complete(w: World, c: Country, id: string) {
  const definition = historicalEvent(id)!;
  for (const requirement of definition.requires) {
    if (!c.focuses.includes(requirement)) complete(w, c, requirement.slice(8));
  }
  if (!c.focuses.includes(historicalFocusId(id)))
    c.focuses.push(historicalFocusId(id));
  w.historical ??= { pending: [], resolved: [] };
  if (!w.historical.resolved.some((item) => item.eventId === id))
    w.historical.resolved.push({
      eventId: id,
      day: w.day,
      outcome: "accepted",
      by: c.id,
    });
}

test("Historical AI prioritizes dated diplomacy over both common and domestic investment", () => {
  const { w, c } = fixture();
  c.focuses.push("industry");
  w.day = 66; // 7 March 1936
  assert.equal(chooseAIFocus(w, c)?.id, "history-rhineland");
  w.day = 0;
  assert.notEqual(chooseAIFocus(w, c)?.id, "history-rhineland");
});

test("Common foundations and domestic policies alternate instead of starving research", () => {
  const { w, c } = fixture();
  assert.equal(chooseAIFocus(w, c)?.effect, "civil");
  c.focuses.push("industry");
  const policy = chooseAIFocus(w, c)!;
  assert.equal(historicalEvent(policy.id.slice(8))?.kind, "domestic");
  complete(w, c, policy.id.slice(8));
  const foundation = chooseAIFocus(w, c)!;
  assert.notEqual(foundation.effect, "historical");
  c.focuses.push(foundation.id);
  assert.equal(
    historicalEvent(chooseAIFocus(w, c)!.id.slice(8))?.kind,
    "domestic",
  );
});

test("A large completed policy catalogue never makes historical AI choose an alternate uprising", () => {
  const { w, c } = fixture();
  for (const focus of focusTree(c.id).filter(
    (focus) => focus.effect !== "historical",
  ))
    c.focuses.push(focus.id);
  const policies = countryEvents(c.id).filter(
    (event) => event.era === "policy",
  );
  assert.equal(policies.length, 100);
  for (const policy of policies) complete(w, c, policy.id);
  assert.ok(
    countryEvents(c.id).some((event) =>
      event.domestic?.effects.some((effect) => effect.kind === "uprising"),
    ),
  );
  assert.equal(chooseAIFocus(w, c), undefined);
  assert.ok(
    validateWorld(w),
    "More than forty completed focuses must remain saveable",
  );
});

test("A wartime fuel shortage changes the next domestic investment", () => {
  const { w, c } = fixture();
  const fuel = historicalEvent("national-germany-fuel-depot")!;
  for (const requirement of fuel.requires) complete(w, c, requirement.slice(8));
  c.focuses.push("industry");
  c.wars = ["france"];
  w.countries.france.wars = ["germany"];
  c.stock.fuel = 0;
  assert.equal(chooseAIFocus(w, c)?.id, historicalFocusId(fuel.id));
  c.stock.fuel = 1000;
  assert.notEqual(chooseAIFocus(w, c)?.id, historicalFocusId(fuel.id));
});

test("Domestic investment is available to subjects but unaffordable programmes do not block free foundations", () => {
  const { w, c } = fixture();
  c.subjectOf = "uk";
  c.focuses.push("industry");
  assert.equal(
    historicalEvent(chooseAIFocus(w, c)!.id.slice(8))?.kind,
    "domestic",
  );
  c.treasury = 0;
  assert.notEqual(chooseAIFocus(w, c)?.effect, "historical");
});

test("AI starts and applies an affordable country programme through real command and politics rules", () => {
  const { w, c } = fixture();
  c.focuses.push("industry");
  const selected = chooseAIFocus(w, c)!;
  const definition = historicalEvent(selected.id.slice(8))!;
  const index = Object.keys(w.countries).indexOf(c.id);
  w.day = (7 - (index % 7)) % 7;
  aiDay(w);
  const active = w.countries.germany;
  assert.equal(active.focus?.id, selected.id);
  const money = active.treasury;
  active.focus!.progress = active.focus!.total - 1;
  politicsDay(w);
  assert.ok(
    w.historical?.resolved.some(
      (item) => item.eventId === definition.id && item.outcome === "accepted",
    ),
  );
  assert.equal(
    w.countries.germany.treasury,
    money - (definition.domestic?.costs?.treasury ?? 0),
  );
  assert.ok(validateWorld(w));
});
