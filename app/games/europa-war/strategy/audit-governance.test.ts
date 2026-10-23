import { test } from "node:test";
import assert from "node:assert/strict";
import { conferencesDay, openConference } from "./conference";
import { declareWar } from "./diplomacy";
import { applyAction } from "./engine";
import { startCivilWar } from "./politics";
import { validateWorld } from "./storage";
import { controlled, createWorld, GEOGRAPHY } from "./world";

function coalitionConference() {
  const w = createWorld("germany", "alternative");
  declareWar(w, "germany", "poland");
  declareWar(w, "ussr", "poland");
  w.countries.poland.capitulated = true;
  w.countries.poland.victor = "germany";
  for (const p of controlled(w, "poland")) p.controller = "germany";
  w.warScore.germany = { poland: 1000 };
  w.warScore.ussr = { poland: 100 };
  const q = openConference(w, "poland");
  assert.equal(q.participants[q.turn], "germany");
  return { w, q };
}

test("Teslim olan insan galibin konferans sırası görüşmeleri kilitlemez", () => {
  const { w, q } = coalitionConference();
  w.countries.germany.capitulated = true;
  assert.ok(
    applyAction(w, { type: "peacePass", conference: q.id }).error,
    "Teslim olmuş oyuncu elle pas geçemez",
  );
  conferencesDay(w);
  assert.ok(q.awards.some((a) => a.country === "ussr"));
  assert.ok(q.awards.every((a) => a.country !== "germany"));
  for (let day = 0; day < 100 && q.status === "open"; day++) conferencesDay(w);
  assert.equal(q.status, "closed");
  assert.ok(validateWorld(w));
});

test("Bütün galipler teslim olursa konferans yeni ilhak vermeden sona erer", () => {
  const { w, q } = coalitionConference();
  w.countries.germany.capitulated = true;
  w.countries.ussr.capitulated = true;
  for (let day = 0; day < 30 && q.status === "open"; day++) conferencesDay(w);
  assert.equal(q.status, "closed");
  assert.deepEqual(q.awards, []);
  assert.ok(controlled(w, "poland").length > 0);
  assert.equal(w.countries.poland.capitulated, false);
  assert.ok(validateWorld(w));
});

test("İç savaşta karşı tarafa geçen tümenler eski cephe ve harekât planından ayrılır", () => {
  const w = createWorld("spain", "alternative");
  const lands = controlled(w, "spain");
  const armies = w.armies.filter((a) => a.country === "spain");
  assert.ok(armies.length >= 3);
  const rebelProvince = lands[1].id;
  for (const a of armies.slice(0, 2)) a.province = rebelProvince;
  const loyal = armies[2];
  loyal.province = lands[0].id;
  const border = lands.flatMap((p) =>
    GEOGRAPHY[p.id].neighbors
      .filter((n) => w.provinces[n.id].controller === "spain" && !n.sea)
      .map((n) => [p.id, n.id]),
  )[0];
  w.plans.push({
    id: "governance-plan",
    country: "spain",
    name: "Batı harekâtı",
    armies: [armies[0].id, loyal.id],
    objectives: ["portugal-0"],
    preparation: 50,
    active: true,
    stance: "balanced",
  });
  w.fronts.push({
    id: "governance-front",
    country: "spain",
    provinces: border,
    armies: [armies[1].id],
  });
  assert.ok(validateWorld(w));
  startCivilWar(w, "spain", true);
  for (const a of armies.slice(0, 2)) {
    assert.equal(a.country, "spain-rebels");
    assert.ok(w.plans.every((p) => !p.armies.includes(a.id)));
    assert.ok(w.fronts.every((f) => !f.armies.includes(a.id)));
    assert.equal(a.move, null);
    assert.deepEqual(a.route, []);
  }
  assert.equal(loyal.country, "spain");
  assert.deepEqual(w.plans.find((p) => p.id === "governance-plan")!.armies, [
    loyal.id,
  ]);
  assert.equal(w.plans.find((p) => p.id === "governance-plan")!.active, true);
  assert.ok(!w.fronts.some((f) => f.id === "governance-front"));
  assert.ok(
    validateWorld(w),
    "İç savaş geçişi aynı anda kaydedilebilir olmalı",
  );
});
