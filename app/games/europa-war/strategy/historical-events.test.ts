import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, militaryPower } from "./world";
import { applyAction, advanceHour } from "./engine";
import { createCommand, executeCommand } from "./commands";
import { politicsDay } from "./politics";
import {
  HISTORICAL_EVENTS,
  historicalEvent,
  historicalFocusId,
} from "./historical-catalog";
import {
  historicalFocusAvailability,
  pendingHistoricalDecision,
  resolveHistoricalAI,
} from "./historical-events";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { manage } from "./management";
import { aiDay } from "./ai";
import { reserveReinforcements } from "./reinforcements";
import type { Action, World } from "./types";

function order(w: World, action: Action, country = w.player) {
  const result = executeCommand(w, createCommand(w, action, country), country);
  assert.equal(result.status, "applied", result.message);
  return result.world;
}
function prerequisites(w: World, eventId: string) {
  const definition = historicalEvent(eventId)!;
  for (const focus of definition.requires) {
    prerequisites(w, focus.slice(8));
    const id = focus.slice(8),
      c = w.countries[historicalEvent(id)!.country];
    if (!c.focuses.includes(focus)) c.focuses.push(focus);
    w.historical ??= { pending: [], resolved: [] };
    if (!w.historical.resolved.some((r) => r.eventId === id))
      w.historical.resolved.push({
        eventId: id,
        day: w.day,
        outcome: "accepted",
        by: c.id,
      });
  }
}
function ready(eventId: string, player?: string) {
  const definition = historicalEvent(eventId)!;
  let w = createWorld(player ?? definition.country, "alternative", 1936);
  prerequisites(w, eventId);
  const c = w.countries[definition.country];
  c.political = 500;
  // Keep the small deterministic diplomatic fixture at peace.
  for (const country of Object.values(w.countries)) country.wars = [];
  w = order(
    w,
    { type: "focus", id: historicalFocusId(eventId) },
    definition.country,
  );
  w.countries[definition.country].focus!.progress = definition.days - 1;
  politicsDay(w);
  return w;
}
const choice = (
  eventId: string,
  value: "accept" | "decline" = "accept",
): Action => ({
  type: "historicalChoice",
  id: historicalFocusId(eventId),
  choice: value,
});

test("Tarihî odak maliyeti bir kez ödenir; tamamlanma ilhak etmez", () => {
  let w = createWorld("germany", "alternative", 1936);
  prerequisites(w, "anschluss");
  const before = w.countries.germany.political;
  w = order(w, { type: "focus", id: "history-anschluss" });
  assert.equal(w.countries.germany.political, before - 100);
  const duplicate = applyAction(w, { type: "focus", id: "history-anschluss" });
  assert.ok(duplicate.error);
  assert.equal(duplicate.world, w);
  w.countries.germany.focus!.progress = 69;
  politicsDay(w);
  assert.equal(w.provinces["austria-0"].owner, "austria");
  assert.equal(pendingHistoricalDecision(w)?.eventId, "anschluss");
  assert.equal(w.countries.germany.political, before - 100);
  assert.ok(validateWorld(w));
});
test("Tarih, yetersiz diplomasi gücü ve önceki ret odağı atomik olarak engeller", () => {
  const w = createWorld("germany", "historical", 1936);
  prerequisites(w, "anschluss");
  assert.match(
    applyAction(w, { type: "focus", id: "history-anschluss" }).error!,
    /1938/,
  );
  w.mode = "alternative";
  w.countries.germany.political = 99;
  assert.match(
    applyAction(w, { type: "focus", id: "history-anschluss" }).error!,
    /100/,
  );
  w.countries.germany.political = 500;
  w.historical!.resolved[0].outcome = "declined";
  assert.match(
    historicalFocusAvailability(w, w.countries.germany, "anschluss")!,
    /Önceki/,
  );
  assert.equal(w.countries.germany.focus, null);
});
test("Anschluss reddi toprak değiştirmez, tekrar uygulanamaz ve tarihsel takvim kararı ezmez", () => {
  let w = ready("anschluss");
  w = order(w, choice("anschluss", "decline"));
  assert.equal(w.provinces["austria-0"].owner, "austria");
  assert.equal(w.historical!.resolved.at(-1)!.outcome, "declined");
  assert.equal(pendingHistoricalDecision(w), undefined);
  const repeated = applyAction(w, choice("anschluss"));
  assert.ok(repeated.error);
  assert.equal(repeated.world, w);
  w.mode = "historical";
  w.day = 1000;
  politicsDay(w);
  assert.equal(w.provinces["austria-0"].owner, "austria");
  assert.equal(w.countries.germany.claims.includes("austria"), false);
});
test("Barışçıl Anschluss birlikleri ve depoları aktarır; komutan ve kayıt bağları geçerli kalır", () => {
  let w = ready("anschluss");
  const oldIds = w.armies
      .filter((a) => a.country === "austria")
      .map((a) => a.id),
    rifles =
      w.countries.germany.equipment.rifle + w.countries.austria.equipment.rifle;
  assert.ok(militaryPower(w, "germany") > militaryPower(w, "austria") * 1.25);
  const general = w.countries.austria.generals[0],
    army = w.armies.find((a) => a.id === oldIds[0])!;
  army.general = general.id;
  general.front = {
    target: "germany",
    stance: "defend",
    assignments: { [army.id]: army.province },
  };
  w.fronts.push({
    id: "fixture-front",
    country: "austria",
    provinces: ["austria-0", "austria-1"],
    armies: [army.id],
  });
  w = order(w, choice("anschluss"));
  assert.equal(w.provinces["austria-0"].owner, "germany");
  assert.equal(w.countries.austria.capitulated, true);
  assert.equal(w.countries.germany.equipment.rifle, rifles);
  assert.equal(w.countries.austria.equipment.rifle, 0);
  assert.ok(
    oldIds.every((id) =>
      w.armies.some(
        (a) => a.id === id && a.country === "germany" && a.general === null,
      ),
    ),
  );
  assert.equal(
    w.fronts.some((f) => f.country === "austria"),
    false,
  );
  assert.ok(w.countries.austria.generals.every((g) => !g.front));
  assert.ok(validateWorld(w));
  const loaded = decodeSave(encodeSave(w));
  assert.deepEqual(loaded, w);
  assert.ok(validateWorld(advanceHour(loaded)));
});
test("Oyuncu Avusturya ise AI onun adına karar veremez; ret bağımsızlığı korur", () => {
  let w = ready("anschluss", "austria");
  assert.equal(pendingHistoricalDecision(w)?.stage, "respond");
  resolveHistoricalAI(w);
  politicsDay(w);
  assert.equal(w.provinces["austria-0"].owner, "austria");
  assert.ok(pendingHistoricalDecision(w));
  w = order(w, choice("anschluss", "decline"));
  assert.equal(w.countries.austria.capitulated, false);
  assert.equal(w.countries.germany.wars.includes("austria"), false);
});
test("Oyuncu Avusturya ilhakı kabul edebilir; teslimiyetten sonra bekleyen karar oyunu kilitlemez", () => {
  let w = ready("anschluss", "austria");
  w = order(w, choice("anschluss"));
  assert.equal(w.countries.austria.capitulated, true);
  assert.equal(pendingHistoricalDecision(w), undefined);
  assert.ok(validateWorld(w));
});
test("Güçlü ve istikrarlı AI Avusturya ilhak talebini reddeder", () => {
  let w = ready("anschluss");
  w.countries.austria.stability = 90;
  w = order(w, choice("anschluss"));
  assert.equal(w.countries.austria.capitulated, false);
  assert.equal(w.historical!.resolved.at(-1)!.outcome, "declined");
});
test("Üçüncü taraf işgali ve sonradan değişen dünya koşulları ilhakı engeller", () => {
  let w = ready("anschluss");
  w.provinces["austria-0"].controller = "italy";
  const rejected = applyAction(w, choice("anschluss"));
  assert.ok(rejected.error);
  assert.equal(rejected.world, w);
  assert.equal(w.provinces["austria-0"].controller, "italy");
  w = order(w, choice("anschluss", "decline"));
  assert.equal(pendingHistoricalDecision(w), undefined);
});
test("Başka ülke bekleyen kararı cevaplayamaz", () => {
  const w = ready("anschluss");
  const result = executeCommand(
    w,
    createCommand(w, choice("anschluss"), "france"),
    "france",
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.world, w);
});
test("Münih yalnız Liberec'i devreder; Prag ve diğer şehirler bağımsız kalır", () => {
  let w = ready("munich");
  w.countries.czechoslovakia.stability = 30;
  w.armies = w.armies.filter((a) => a.country !== "czechoslovakia");
  w = order(w, choice("munich"));
  assert.equal(w.provinces["czechoslovakia-city-1"].owner, "germany");
  assert.equal(w.provinces["czechoslovakia-0"].owner, "czechoslovakia");
  assert.ok(validateWorld(w));
});
test("Savaş kararı aktif paktı aşamaz; ret sonrası eski tarih olayı savaş başlatmaz", () => {
  let w = ready("barbarossa");
  w.countries.germany.pacts.ussr = w.day + 100;
  w.countries.ussr.pacts.germany = w.day + 100;
  assert.match(applyAction(w, choice("barbarossa")).error!, /paktı/);
  w = order(w, choice("barbarossa", "decline"));
  w.mode = "historical";
  w.day = 2100;
  politicsDay(w);
  assert.equal(w.countries.germany.wars.includes("ussr"), false);
});
test("Gerçek savaş seçimi savunma ittifakını harekete geçirir", () => {
  let w = ready("danzig");
  w.countries.poland.allies = ["uk"];
  w.countries.uk.allies.push("poland");
  w = order(w, choice("danzig"));
  assert.ok(w.countries.germany.wars.includes("poland"));
  assert.ok(w.countries.germany.wars.includes("uk"));
  assert.ok(validateWorld(w));
});
test("Pakt ve yardım kararları gerçek simetrik diplomasi ve stok değişiklikleri yapar", () => {
  let w = ready("molotov");
  w = order(w, choice("molotov"));
  assert.equal(w.countries.germany.pacts.ussr, w.day + 730);
  assert.equal(w.countries.ussr.pacts.germany, w.day + 730);
  w = ready("lend-lease");
  w.countries.usa.equipment.rifle = 120;
  w.countries.usa.equipment.truck = 30;
  const before = w.countries.ussr.equipment.rifle;
  w = order(w, choice("lend-lease"));
  assert.equal(w.countries.usa.equipment.rifle, 20);
  assert.equal(w.countries.usa.equipment.truck, 10);
  assert.equal(w.countries.ussr.equipment.rifle, before + 100);
});
test("Araştırma otomasyonu oyuncunun diplomasi puanlarını tarihî odaklara harcamaz", () => {
  const w = createWorld("germany", "alternative", 1936);
  w.countries.germany.focuses = [
    "industry",
    "industry2",
    "railway",
    "science",
    "army",
    "arsenal",
    "mobilize",
    "officers",
    "diplomacy",
    "regional",
    "stability",
  ];
  const before = w.countries.germany.political;
  const submitted: Action[] = [];
  manage(w, w.countries.germany, "research", (action) => {
    submitted.push(action);
    return false;
  });
  assert.equal(
    submitted.some(
      (action) => action.type === "focus" && action.id.startsWith("history-"),
    ),
    false,
  );
  assert.equal(w.countries.germany.political, before);
});
test("Eski kayıtlar aynı kalır; bekleyen ve sonuçlanan tarihî kararlar doğrulanarak yüklenir", () => {
  const old = createWorld("germany");
  assert.deepEqual(decodeSave(encodeSave(old)), old);
  const w = ready("anschluss");
  assert.deepEqual(decodeSave(encodeSave(w)), w);
  for (const corrupt of [
    (x: World) => {
      x.historical!.pending[0].recipient = "france";
    },
    (x: World) => {
      x.historical!.pending.push({ ...x.historical!.pending[0] });
    },
    (x: World) => {
      x.historical!.pending[0].createdDay = w.day + 1;
    },
    (x: World) => {
      x.historical!.pending[0].stage = "respond";
    },
    (x: World) => {
      x.countries.germany.focuses = x.countries.germany.focuses.filter(
        (id) => id !== "history-anschluss",
      );
    },
  ]) {
    const clone = structuredClone(w);
    corrupt(clone);
    assert.equal(validateWorld(clone), false);
  }
});
for (const definition of HISTORICAL_EVENTS)
  test(`${definition.title}: kabul/ret yolları uygulanabilir ve kayıt geçerli`, () => {
    let w = ready(definition.id);
    if (definition.id === "lend-lease") {
      w.countries.usa.equipment.rifle = 200;
      w.countries.usa.equipment.truck = 30;
    }
    const before = structuredClone(w);
    w = order(w, choice(definition.id));
    assert.equal(
      w.historical!.resolved.find((r) => r.eventId === definition.id)?.outcome,
      "accepted",
    );
    const c = w.countries[definition.country],
      t = definition.target ? w.countries[definition.target] : undefined;
    if (definition.kind === "annex") {
      assert.equal(t!.capitulated, true);
      assert.ok(
        Object.values(w.provinces)
          .filter((p) => before.provinces[p.id].owner === t!.id)
          .every((p) => p.owner === c.id && p.controller === c.id),
      );
    }
    if (definition.kind === "territory")
      assert.equal(w.provinces["czechoslovakia-city-1"].owner, c.id);
    if (definition.kind === "war")
      assert.ok(c.wars.includes(t!.id) && t!.wars.includes(c.id));
    if (definition.kind === "pact") assert.equal(c.pacts[t!.id], w.day + 730);
    if (definition.kind === "alliance")
      assert.ok(c.allies.includes(t!.id) && t!.allies.includes(c.id));
    if (definition.kind === "conference")
      assert.equal(
        c.stability,
        Math.min(100, before.countries[c.id].stability + 8),
      );
    if (definition.id === "lend-lease")
      assert.equal(
        c.equipment.rifle,
        before.countries[c.id].equipment.rifle - 100,
      );
    if (definition.kind === "defense") {
      const province = definition.id === "rhineland" ? "germany-2" : "turkey-1";
      assert.equal(
        w.provinces[province].buildings.fort,
        Math.min(5, before.provinces[province].buildings.fort + 1),
      );
    }
    assert.ok(validateWorld(w));
    assert.ok(validateWorld(advanceHour(decodeSave(encodeSave(w)))));
    let rejected = ready(definition.id);
    rejected = order(rejected, choice(definition.id, "decline"));
    assert.ok(validateWorld(rejected));
    assert.equal(rejected.historical!.resolved.at(-1)!.outcome, "declined");
  });

test("Tarihsel AI tarihi gelen ve ödenebilir odağı önce seçer; erken/pahalı/alternatif durumda normal kalkınır", () => {
  const prepare = (
    day: number,
    political: number,
    mode: World["mode"] = "historical",
  ) => {
    const w = createWorld("turkey", mode, 1936);
    w.day = day;
    const index = Object.keys(w.countries).indexOf("germany");
    while ((w.day + index) % 7 !== 0) w.day++;
    w.countries.germany.political = political;
    return w;
  };
  const due = prepare(70, 100);
  aiDay(due);
  assert.equal(due.countries.germany.focus?.id, "history-rhineland");
  const early = prepare(0, 100);
  aiDay(early);
  assert.equal(early.countries.germany.focus?.id, "industry");
  const poor = prepare(70, 49);
  aiDay(poor);
  assert.equal(poor.countries.germany.focus?.id, "industry");
  const alternative = prepare(70, 100, "alternative");
  aiDay(alternative);
  assert.equal(alternative.countries.germany.focus?.id, "industry");
  const active = prepare(70, 100);
  active.countries.germany.focus = { id: "industry", progress: 12, total: 56 };
  aiDay(active);
  assert.deepEqual(active.countries.germany.focus, {
    id: "industry",
    progress: 12,
    total: 56,
  });
});

test("Açık konferansta daha önce toprak kazanan ülke ilhakla eski ödüllerini diriltemez", () => {
  const w = ready("anschluss");
  w.countries.poland.capitulated = true;
  w.countries.poland.victor = "austria";
  w.conferences.push({
    id: "fixture-pending-award",
    defeated: "poland",
    participants: ["austria"],
    points: { austria: 100 },
    available: ["poland-1"],
    awards: [
      { province: "poland-0", country: "austria", kind: "annex", cost: 1 },
    ],
    round: 1,
    turn: 0,
    status: "open",
  });
  assert.ok(validateWorld(w));
  const result = applyAction(w, choice("anschluss"));
  assert.match(result.error!, /konferans/);
  assert.equal(result.world, w);
  assert.equal(w.provinces["austria-0"].owner, "austria");
  assert.equal(w.conferences[0].awards[0].country, "austria");
});

test("Anschluss bekleyen ücretli Avusturya takviyesini çoğaltmaz; kayıt ve sonraki saatte kayıp defteri korunur", () => {
  let w = ready("anschluss");
  const austria = w.countries.austria;
  const army = w.armies.find((candidate) => candidate.country === "austria")!;
  army.province = "austria-1";
  army.strength = 80;
  army.supply = 1;
  const general = austria.generals[0];
  army.general = general.id;
  general.front = {
    target: "germany",
    stance: "defend",
    assignments: { [army.id]: army.province },
  };
  w.fronts.push({
    id: "paid-austrian-front",
    country: "austria",
    provinces: ["austria-0", "austria-1"],
    armies: [army.id],
  });
  const originalMen = austria.manpower,
    originalEquipment = structuredClone(austria.equipment);
  reserveReinforcements(w, new Set([army.id]));
  assert.equal(w.reinforcements!.shipments.length, 1);
  const paid = structuredClone(w.reinforcements!.shipments[0].cargo);
  assert.ok(paid.manpower > 0);
  assert.equal(austria.manpower, originalMen - paid.manpower);
  for (const [equipment, amount] of Object.entries(paid.equipment)) {
    const key = equipment as keyof typeof austria.equipment;
    assert.equal(austria.equipment[key], originalEquipment[key] - amount);
  }
  const availableMen = w.countries.germany.manpower + austria.manpower;
  const availableEquipment = Object.fromEntries(
    Object.keys(austria.equipment).map((equipment) => {
      const key = equipment as keyof typeof austria.equipment;
      return [key, w.countries.germany.equipment[key] + austria.equipment[key]];
    }),
  );
  const ledgerBefore = structuredClone(w.reinforcements!.ledger.austria);
  w = order(w, choice("anschluss"));
  assert.equal(
    w.armies.find((candidate) => candidate.id === army.id)!.country,
    "germany",
  );
  assert.equal(
    w.armies.find((candidate) => candidate.id === army.id)!.general,
    null,
  );
  assert.equal(
    w.fronts.some((front) => front.country === "austria"),
    false,
  );
  assert.deepEqual(w.reinforcements!.ledger.austria, ledgerBefore);
  assert.equal(w.reinforcements!.shipments[0].country, "austria");
  assert.equal(w.countries.germany.manpower, availableMen);
  assert.deepEqual(w.countries.germany.equipment, availableEquipment);
  const loaded = decodeSave(encodeSave(w));
  assert.deepEqual(loaded.reinforcements, w.reinforcements);
  assert.ok(validateWorld(loaded));
  const next = advanceHour(loaded);
  assert.equal(next.reinforcements!.shipments.length, 0);
  assert.deepEqual(next.reinforcements!.ledger.austria.lost, paid);
  assert.deepEqual(next.reinforcements!.ledger.austria.dispatched, paid);
  assert.equal(next.reinforcements!.ledger.austria.delivered.manpower, 0);
  assert.equal(next.reinforcements!.ledger.austria.returned.manpower, 0);
  assert.equal(next.countries.germany.manpower, availableMen);
  assert.deepEqual(next.countries.germany.equipment, availableEquipment);
  assert.equal(next.countries.austria.manpower, 0);
  assert.equal(
    next.armies.find((candidate) => candidate.id === army.id)!.strength,
    80,
  );
  assert.ok(validateWorld(next));
  assert.deepEqual(
    decodeSave(encodeSave(next)).reinforcements,
    next.reinforcements,
  );
});
