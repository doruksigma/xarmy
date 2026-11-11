import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, MAP } from "./world";
import { advanceHour, applyAction } from "./engine";
import { createCommand, executeCommand } from "./commands";
import { politicsDay } from "./politics";
import { resolveLandDay } from "./land";
import {
  allCountryEvents,
  countryEvents,
  historicalFocusId,
} from "./historical-catalog";
import {
  applyNationalProgramme,
  nationalCivilWarVictory,
  nationalProgrammeProblem,
} from "./national-event-effects";
import {
  historicalFocusAvailability,
  pendingHistoricalDecision,
} from "./historical-events";
import {
  decodeSave,
  encodeSave,
  validateWorld,
  MAX_SAVE_BYTES,
} from "./storage";
import type { NationalProgramme } from "./national-event-types";
import type { Action, World } from "./types";

const programme: NationalProgramme = {
  costs: { treasury: 120, stock: { steel: 20 } },
  effects: [
    { kind: "building", building: "civil", amount: 1, location: "lowest" },
  ],
};
function funded(player = "germany") {
  const w = createWorld(player, "alternative", 1936);
  const c = w.countries[player];
  c.treasury = 100000;
  c.political = 500;
  for (const resource of Object.keys(c.stock) as (keyof typeof c.stock)[])
    c.stock[resource] = 10000;
  for (const equipment of Object.keys(
    c.equipment,
  ) as (keyof typeof c.equipment)[])
    c.equipment[equipment] = 10000;
  return w;
}
function command(w: World, action: Action) {
  const result = executeCommand(w, createCommand(w, action), w.player);
  assert.equal(result.status, "applied", result.message);
  return result.world;
}
function finishFocus(w: World, id: string) {
  w.countries[w.player].political = 500;
  w = command(w, { type: "focus", id: historicalFocusId(id) });
  w.countries[w.player].focus!.progress =
    w.countries[w.player].focus!.total - 1;
  politicsDay(w);
  assert.equal(pendingHistoricalDecision(w)?.eventId, id);
  return w;
}
function accept(w: World, id: string) {
  w = finishFocus(w, id);
  return command(w, {
    type: "historicalChoice",
    id: historicalFocusId(id),
    choice: "accept",
  });
}
function imperialUprising() {
  let w = funded();
  for (const id of [
    "conservative-circle",
    "officers-pact",
    "dynastic-petition",
    "monarchist-uprising",
  ])
    w = accept(w, `national-germany-${id}`);
  return w;
}

test("Ulusal program gerçek bütçe ve çelik harcar, en az sanayili kendi bölgesine fabrika kurar", () => {
  const w = funded(),
    c = w.countries.germany;
  const total = Object.values(w.provinces)
    .filter((p) => p.owner === c.id)
    .reduce((n, p) => n + p.buildings.civil, 0);
  const money = c.treasury,
    steel = c.stock.steel;
  applyNationalProgramme(w, c, programme);
  assert.equal(c.treasury, money - 120);
  assert.equal(c.stock.steel, steel - 20);
  assert.equal(
    Object.values(w.provinces)
      .filter((p) => p.owner === c.id)
      .reduce((n, p) => n + p.buildings.civil, 0),
    total + 1,
  );
  assert.ok(validateWorld(w));
});
test("Başta veya karar sırasında yetersiz kaynak ve dolu tesis kapasitesi bedelsiz ya da kısmi sonuç üretmez", () => {
  let w = funded();
  w = finishFocus(w, "national-germany-workshops");
  w.countries.germany.stock.steel = 0;
  const before = structuredClone(w);
  const result = applyAction(w, {
    type: "historicalChoice",
    id: "history-national-germany-workshops",
    choice: "accept",
  });
  assert.match(result.error!, /Çelik|çelik/);
  assert.equal(result.world, w);
  assert.deepEqual(w, before);
  w.countries.germany.stock.steel = 100;
  for (const province of Object.values(w.provinces))
    if (province.owner === "germany") province.buildings.civil = 12;
  const blocked = applyAction(w, {
    type: "historicalChoice",
    id: "history-national-germany-workshops",
    choice: "accept",
  });
  assert.match(blocked.error!, /kapasitesi/);
  assert.equal(blocked.world, w);
});
test("Bağlı ülkeler iç sanayi programını seçebilir, bağımsız dış diplomasi ve isyan şartı korunur", () => {
  let w = funded("india");
  assert.equal(w.countries.india.subjectOf, "uk");
  assert.equal(
    historicalFocusAvailability(
      w,
      w.countries.india,
      "national-india-workshops",
    ),
    null,
  );
  w = accept(w, "national-india-workshops");
  assert.equal(w.countries.india.subjectOf, "uk");
  assert.ok(validateWorld(w));
  assert.match(
    nationalProgrammeProblem(w, w.countries.india, {
      requirements: { independent: true },
      effects: [{ kind: "political", amount: 1 }],
    })!,
    /bağımsızlık/,
  );
});
test("Araştırma programı gerçek projeyi başlatır/ilerletir; tamamlanınca teknoloji açılır", () => {
  const w = funded(),
    c = w.countries.germany;
  applyNationalProgramme(w, c, {
    effects: [{ kind: "research", technology: "industry1", progress: 20 }],
  });
  assert.equal(
    c.research.find((project) => project.id === "industry1")?.progress,
    20,
  );
  applyNationalProgramme(w, c, {
    effects: [{ kind: "research", technology: "industry1", progress: 1000 }],
  });
  assert.ok(c.tech.includes("industry1"));
  assert.equal(
    c.research.some((project) => project.id === "industry1"),
    false,
  );
  assert.ok(validateWorld(w));
});
test("Önceden veya hazırlık sırasında bilinen araştırma belgelenen bilim bonusunu verir; dolu yuva gerekmez", () => {
  const w = funded(),
    c = w.countries.germany;
  c.science = 0.3;
  c.research = [
    { id: "industry1", progress: 1, total: 100 },
    { id: "weapons1", progress: 1, total: 100 },
  ];
  const known: NationalProgramme = {
    costs: { treasury: 70 },
    effects: [
      { kind: "research", technology: "armor1", progress: 35, ifKnown: 0.01 },
    ],
  };
  const before = c.treasury;
  applyNationalProgramme(w, c, known);
  assert.equal(c.science, 0.31);
  assert.equal(c.treasury, before - 70);
  assert.equal(c.research.length, 2);
  c.science = 10;
  assert.match(nationalProgrammeProblem(w, c, known)!, /en yüksek/);
});
test("Siyasi destek, yönetim ve eğitim gerçek ülke ve tümen değerlerini değiştirir", () => {
  const w = funded(),
    c = w.countries.germany,
    army = w.armies.find((item) => item.country === c.id)!;
  army.experience = 5;
  army.organization = 50;
  applyNationalProgramme(w, c, {
    effects: [
      { kind: "party", ideology: "monarchy", amount: 12 },
      { kind: "training", experience: 8, organization: 10 },
    ],
  });
  assert.equal(army.experience, 13);
  assert.equal(army.organization, 60);
  assert.ok(
    Math.abs(Object.values(c.parties).reduce((a, b) => a + b, 0) - 100) < 1e-8,
  );
  applyNationalProgramme(w, c, {
    effects: [
      {
        kind: "government",
        ideology: "democracy",
        name: "Almanya Cumhuriyeti",
        leader: "Anayasal koalisyon",
      },
    ],
  });
  assert.equal(c.ideology, "democracy");
  assert.equal(c.parties.democracy, 80);
  assert.equal(c.name, "Almanya Cumhuriyeti");
  assert.ok(validateWorld(w));
});
test("Almanya sanayi dalının on olayı gerçek komutlarla ilerler; bilinen teknoloji dalı kilitlemez", () => {
  let w = funded();
  w.countries.germany.tech.push("industry1", "industry2");
  const branch = countryEvents("germany").filter(
    (definition) => definition.branch === "Ulusal Sanayi",
  );
  assert.equal(branch.length, 10);
  for (const definition of branch) w = accept(w, definition.id);
  assert.ok(
    branch.every((definition) =>
      w.historical!.resolved.some(
        (result) =>
          result.eventId === definition.id && result.outcome === "accepted",
      ),
    ),
  );
  assert.ok(validateWorld(w));
});
test("Monarşist ayaklanma oyuncu kimliğini korur, iki ayrı ordu ve gerçek iç savaş oluşturur", () => {
  const w = imperialUprising(),
    c = w.countries.germany,
    r = w.countries["germany-rebels"];
  assert.equal(w.player, "germany");
  assert.equal(c.ideology, "monarchy");
  assert.equal(c.name, "Alman Geçici Yönetimi");
  assert.equal(r.ideology, "fascism");
  assert.equal(r.parties.fascism, 68);
  assert.ok(c.wars.includes(r.id) && r.wars.includes(c.id));
  assert.ok(w.armies.some((army) => army.country === c.id));
  assert.ok(w.armies.some((army) => army.country === r.id));
  assert.ok(
    Object.values(w.provinces).some((province) => province.owner === r.id),
  );
  assert.equal(nationalCivilWarVictory(w, c), false);
  assert.match(
    historicalFocusAvailability(w, c, "national-germany-restore-empire")!,
    /barış|savaşı/,
  );
  assert.ok(validateWorld(w));
  assert.ok(validateWorld(decodeSave(encodeSave(w))));
  assert.ok(validateWorld(advanceHour(w)));
});
test("Ateşkes veya yabancı galibiyet imparatorluğu açmaz; gerçek iç savaş teslimiyetiyle restorasyon yapılır", () => {
  let w = imperialUprising();
  const c = w.countries.germany,
    r = w.countries["germany-rebels"];
  const peace = structuredClone(w);
  peace.countries.germany.wars = [];
  peace.countries[r.id].wars = [];
  assert.equal(nationalCivilWarVictory(peace, peace.countries.germany), false);
  const foreign = structuredClone(w);
  foreign.countries[r.id].capitulated = true;
  foreign.countries[r.id].victor = "france";
  assert.equal(
    nationalCivilWarVictory(foreign, foreign.countries.germany),
    false,
  );
  // A battle checkpoint with all opposition regions occupied is settled by
  // the same surrender/peace-conference engine used in a played campaign.
  for (const province of Object.values(w.provinces))
    if (province.owner === r.id) province.controller = c.id;
  resolveLandDay(w);
  assert.equal(w.countries[r.id].capitulated, true);
  assert.equal(w.countries[r.id].victor, c.id);
  assert.equal(nationalCivilWarVictory(w, w.countries.germany), true);
  w = accept(w, "national-germany-restore-empire");
  assert.equal(w.countries.germany.name, "Alman İmparatorluğu");
  assert.equal(w.countries.germany.ideology, "monarchy");
  assert.equal(w.countries.germany.wars.includes(r.id), false);
  assert.equal(
    Object.values(w.provinces).some((province) => province.owner === r.id),
    false,
  );
  assert.ok(
    w.conferences
      .filter((conference) => conference.defeated === r.id)
      .every((conference) => conference.status === "closed"),
  );
  assert.ok(validateWorld(w));
  assert.ok(validateWorld(advanceHour(decodeSave(encodeSave(w)))));
});
test("Birbirine kapalı Alman siyasi yolları ve tamamlanmış olayların tekrarı atomik olarak reddedilir", () => {
  let w = funded();
  w = accept(w, "national-germany-conservative-circle");
  const choice = applyAction(w, {
    type: "focus",
    id: "history-national-germany-constitutional-opposition",
  });
  assert.match(choice.error!, /bağdaşmıyor/);
  assert.equal(choice.world, w);
  const duplicate = applyAction(w, {
    type: "historicalChoice",
    id: "history-national-germany-conservative-circle",
    choice: "accept",
  });
  assert.ok(duplicate.error);
  assert.equal(duplicate.world, w);
});
test("Eski kayıt değişmez; bütün ülke kataloglarının uzun olay geçmişi kayıt bütçesi içinde doğrulanır", () => {
  const original = createWorld("germany");
  assert.deepEqual(decodeSave(encodeSave(original)), original);
  const w = funded();
  w.historical = { pending: [], resolved: [] };
  for (const definition of allCountryEvents()) {
    const c = w.countries[definition.country];
    c.focuses.push(historicalFocusId(definition.id));
    w.historical.resolved.push({
      eventId: definition.id,
      day: 0,
      outcome: "declined",
      by: definition.country,
    });
  }
  assert.ok(
    MAP.countries.every(
      (country) => w.countries[country.id].focuses.length >= 100,
    ),
  );
  assert.ok(w.countries.germany.focuses.length >= 150);
  assert.ok(validateWorld(w));
  const data = encodeSave(w);
  assert.ok(
    Buffer.byteLength(data) < MAX_SAVE_BYTES,
    `save size ${Buffer.byteLength(data)}`,
  );
  assert.deepEqual(decodeSave(data).historical, w.historical);
});

test("Karma bilim ve bilinen teknoloji bonusu en yüksek katsayıyı aşamaz veya bedel harcayamaz", () => {
  const w = funded(),
    c = w.countries.germany;
  c.science = 9.98;
  const combined: NationalProgramme = {
    costs: { treasury: 150 },
    effects: [
      { kind: "science", amount: 0.035 },
      { kind: "research", technology: "armor1", progress: 30, ifKnown: 0.01 },
    ],
  };
  const before = structuredClone(w);
  assert.match(nationalProgrammeProblem(w, c, combined)!, /en yüksek/);
  assert.throws(() => applyNationalProgramme(w, c, combined), /en yüksek/);
  assert.deepEqual(w, before);
});

test("Odak hazırlanırken paralel araştırma tamamlanırsa karar bilinen teknoloji bonusuna dönüşür", () => {
  let w = funded();
  w = accept(w, "national-germany-workshops");
  w = command(w, {
    type: "focus",
    id: "history-national-germany-machine-tools",
  });
  const c = w.countries.germany;
  assert.equal(c.tech.includes("industry1"), false);
  c.research.push({ id: "industry1", progress: 99, total: 100 });
  c.focus!.progress = c.focus!.total - 1;
  politicsDay(w);
  assert.ok(c.tech.includes("industry1"));
  assert.equal(
    pendingHistoricalDecision(w)?.eventId,
    "national-germany-machine-tools",
  );
  const science = c.science;
  w = command(w, {
    type: "historicalChoice",
    id: "history-national-germany-machine-tools",
    choice: "accept",
  });
  assert.equal(w.countries.germany.science, science + 0.01);
  assert.equal(
    w.countries.germany.research.some((project) => project.id === "industry1"),
    false,
  );
  assert.ok(validateWorld(w));
});
