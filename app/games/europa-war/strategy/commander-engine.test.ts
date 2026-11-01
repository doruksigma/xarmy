import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction, advanceDay } from "./engine";
import { declareWar } from "./diplomacy";
import { economyDay } from "./economy";
import { resolveLandDay } from "./land";
import {
  commandersDay,
  commanderArmies,
  commanderBorders,
  commanderTargets,
  COMMANDER_CAPACITY,
} from "./commanders";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { Action, World } from "./types";

function order(w: World, action: Action): World {
  const result = applyAction(w, action);
  assert.equal(result.error, null);
  return result.world;
}
function fixture(country = "turkey", count = 12) {
  const w = createWorld(country);
  w.armies = [];
  w.countries[country].autoAssignCommanders = true;
  for (let i = 0; i < count; i++)
    addArmy(w, country, w.countries[country].capital);
  return w;
}
function landDays(w: World, count: number) {
  for (let i = 0; i < count; i++) {
    w.day++;
    commandersDay(w);
    resolveLandDay(w);
  }
}

test("Otomatik atama 12 tümen sınırını korur, taşan tümenler yeni ve emirsiz komutana gider", () => {
  const w = fixture("turkey", 25);
  const c = w.countries.turkey;
  const counts = c.generals
    .map((g) => commanderArmies(w, c.id, g.id).length)
    .filter(Boolean);
  assert.deepEqual(counts, [12, 12, 1]);
  assert.equal(COMMANDER_CAPACITY, 12);
  assert.ok(c.generals.every((g) => !g.front));
  assert.ok(w.armies.every((a) => a.general && !a.move && !a.route.length));
});

test("Otomatik atama kapatılabilir; tekrar açılınca boşta kalan tümenler kapasiteye göre atanır", () => {
  let w = order(fixture("turkey", 12), {
    type: "commanderAutoAssign",
    enabled: false,
  });
  const added = addArmy(w, w.player, w.countries[w.player].capital);
  assert.equal(added.general, null);
  w = order(w, { type: "commanderAutoAssign", enabled: true });
  assert.ok(w.armies.find((a) => a.id === added.id)!.general);
  assert.ok(
    w.countries[w.player].generals.every(
      (g) => commanderArmies(w, w.player, g.id).length <= 12,
    ),
  );
});

test("Gerçek eğitim kuyruğundan çıkan 13. tümen dolu komutan yerine boş komutana atanır", () => {
  let w = fixture();
  const full = w.armies[0].general;
  w = order(w, { type: "recruit", unit: "infantry", province: "turkey-0" });
  for (let i = 0; i < 28; i++) economyDay(w);
  assert.equal(w.armies.filter((a) => a.country === w.player).length, 13);
  const fresh = w.armies.at(-1)!;
  assert.ok(fresh.general && fresh.general !== full);
  assert.equal(commanderArmies(w, w.player, full!).length, 12);
  assert.equal(
    w.countries[w.player].generals.find((g) => g.id === fresh.general)!.front,
    undefined,
  );
});

test("Sınır seçimi yalnızca mevcut kara komşularını sunar; uzak ülke emri atomik reddedilir", () => {
  const w = fixture();
  const targets = commanderTargets(w, w.player).map((c) => c.id);
  assert.ok(targets.includes("bulgaria"));
  assert.ok(!targets.includes("germany") && !targets.includes(w.player));
  const rejected = applyAction(w, {
    type: "commanderDeploy",
    general: w.armies[0].general!,
    target: "germany",
  });
  assert.ok(rejected.error);
  assert.equal(rejected.world, w);
  assert.ok(w.armies.every((a) => !a.move && !a.route.length));
});

test("Sınır yerleşimi tüm üyelere dengeli hedef ve gerçek yürüyüş rotası verir", () => {
  const original = fixture();
  const general = original.armies[0].general!;
  const w = order(original, {
    type: "commanderDeploy",
    general,
    target: "bulgaria",
  });
  const front = w.countries.turkey.generals.find(
    (g) => g.id === general,
  )!.front!;
  const borders = commanderBorders(w, "turkey", "bulgaria");
  assert.equal(front.stance, "defend");
  assert.equal(front.target, "bulgaria");
  assert.equal(Object.keys(front.assignments).length, 12);
  const counts = borders.map(
    (id) => Object.values(front.assignments).filter((p) => p === id).length,
  );
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.ok(counts.every((n) => n > 0));
  assert.ok(
    w.armies.every((a) => a.province === "turkey-0"),
    "Birlikler ışınlanmaz",
  );
  // Real travel includes the starting stack's supply penalty; keep a finite
  // arrival bound without assuming every region has upgraded infrastructure.
  for (
    let day = 0;
    day < 100 &&
    commanderArmies(w, w.player, general).some(
      (a) => a.province !== front.assignments[a.id],
    );
    day++
  )
    landDays(w, 1);
  assert.ok(
    commanderArmies(w, w.player, general).every(
      (a) => a.province === front.assignments[a.id],
    ),
  );
  assert.ok(
    w.armies.every((a) => w.provinces[a.province].controller === w.player),
  );
});

test("Sınır atanmayan komutan saldırı/savunma emri alamaz; dolu komutana manuel 13. tümen eklenemez", () => {
  const w = fixture("turkey", 13);
  const full = w.armies[0].general!;
  for (const stance of ["attack", "defend"] as const) {
    const result = applyAction(w, {
      type: "commanderStance",
      general: full,
      stance,
    });
    assert.ok(result.error);
    assert.equal(result.world, w);
  }
  const overflow = w.armies.at(-1)!;
  const rejected = applyAction(w, {
    type: "general",
    army: overflow.id,
    general: full,
  });
  assert.ok(rejected.error);
  assert.equal(rejected.world, w);
  assert.notEqual(overflow.general, full);
});

test("Saldırı emri savaş ilanı olmadan sınırı geçemez; savunma savaşta da şehir işgal etmez", () => {
  let w = fixture();
  const general = w.armies[0].general!;
  w = order(w, { type: "commanderDeploy", general, target: "bulgaria" });
  const rejected = applyAction(w, {
    type: "commanderStance",
    general,
    stance: "attack",
  });
  assert.ok(rejected.error);
  assert.equal(rejected.world, w);
  declareWar(w, "turkey", "bulgaria");
  landDays(w, 70);
  assert.ok(
    Object.values(w.provinces)
      .filter((p) => p.owner === "bulgaria")
      .every((p) => p.controller === "bulgaria"),
  );
  assert.ok(
    w.armies.every(
      (a) => !a.move || w.provinces[a.move.to].controller === w.player,
    ),
  );
});

test("Saldırı yalnızca atanmış devlette ilerler; ikinci savaş ve emirsiz komutan otomasyona katılmaz", () => {
  let w = fixture("germany", 13);
  declareWar(w, "germany", "poland");
  declareWar(w, "germany", "czechoslovakia");
  const active = w.armies[0].general!;
  const idle = w.armies.at(-1)!;
  for (const a of w.armies) a.province = "germany-7";
  const idleId = idle.id;
  w = order(w, { type: "commanderDeploy", general: active, target: "poland" });
  w = order(w, { type: "commanderStance", general: active, stance: "attack" });
  for (let i = 0; i < 110; i++) {
    landDays(w, 1);
    const reserve = w.armies.find((a) => a.id === idleId)!;
    assert.equal(reserve.province, "germany-7");
    assert.equal(reserve.move, null);
    assert.deepEqual(reserve.route, []);
    for (const a of commanderArmies(w, "germany", active))
      for (const id of [...a.route, ...(a.move ? [a.move.to] : [])])
        assert.ok(
          ["germany", "poland"].includes(w.provinces[id].controller),
          `Başka ülkeye saldırı yok: ${id}`,
        );
    if (
      Object.values(w.provinces).some(
        (p) => p.owner === "poland" && p.controller === "germany",
      )
    )
      break;
  }
  assert.ok(
    Object.values(w.provinces).some(
      (p) => p.owner === "poland" && p.controller === "germany",
    ),
  );
  assert.ok(
    Object.values(w.provinces)
      .filter((p) => p.owner === "czechoslovakia")
      .every((p) => p.controller === "czechoslovakia"),
  );
});

test("Saldırıdan savunmaya dönüş düşman hareketini iptal eder; geri çağırma otomatik yardımı durdurur", () => {
  let w = fixture();
  declareWar(w, "turkey", "bulgaria");
  const general = w.armies[0].general!;
  const border = commanderBorders(w, "turkey", "bulgaria")[0];
  for (const a of w.armies) a.province = border;
  w = order(w, { type: "commanderDeploy", general, target: "bulgaria" });
  w = order(w, { type: "commanderStance", general, stance: "attack" });
  commandersDay(w);
  assert.ok(
    w.armies.some((a) =>
      [...a.route, ...(a.move ? [a.move.to] : [])].some(
        (id) => w.provinces[id].controller === "bulgaria",
      ),
    ),
  );
  w = order(w, { type: "commanderStance", general, stance: "defend" });
  assert.ok(
    w.armies.every((a) =>
      [...a.route, ...(a.move ? [a.move.to] : [])].every(
        (id) => w.provinces[id].controller === w.player,
      ),
    ),
  );
  w = order(w, { type: "commanderRecall", general });
  const positions = w.armies.map((a) => a.province);
  landDays(w, 12);
  assert.deepEqual(
    w.armies.map((a) => a.province),
    positions,
  );
  assert.ok(w.armies.every((a) => !a.move && !a.route.length));
  assert.equal(
    w.countries.turkey.generals.find((g) => g.id === general)!.front,
    undefined,
  );
});

test("Komutan sınır emri eski cephe ve taarruz planlarının üyeleri tekrar yönlendirmesini engeller", () => {
  let w = fixture();
  const general = w.armies[0].general!;
  const ids = w.armies.map((a) => a.id);
  w.fronts.push({
    id: "old-front",
    country: w.player,
    armies: [...ids],
    provinces: ["turkey-0", "turkey-1"],
  });
  w.plans.push({
    id: "old-plan",
    country: w.player,
    armies: [...ids],
    objectives: ["greece-0"],
    preparation: 100,
    active: true,
    stance: "aggressive",
    name: "Eski plan",
  });
  w = order(w, { type: "commanderDeploy", general, target: "bulgaria" });
  assert.ok(w.fronts.every((f) => f.armies.every((id) => !ids.includes(id))));
  assert.ok(w.plans.every((p) => p.armies.every((id) => !ids.includes(id))));
  // Exercise the real daily pipeline, including the old planning/front passes.
  w = advanceDay(w);
  assert.ok(
    commanderArmies(w, w.player, general).every((a) =>
      [...a.route, ...(a.move ? [a.move.to] : [])].every(
        (id) => w.provinces[id].controller === w.player,
      ),
    ),
  );
});

test("Komutan saldırısı gerçek savunucuyla savaşır ve iki tarafa da kayıp verir", () => {
  let w = fixture();
  declareWar(w, "turkey", "bulgaria");
  const general = w.armies[0].general!;
  const borders = commanderBorders(w, "turkey", "bulgaria");
  for (const a of w.armies) a.province = borders[0];
  const targets = [
    ...new Set(
      borders.flatMap((id) =>
        GEOGRAPHY[id].neighbors
          .filter((e) => !e.sea && w.provinces[e.id].controller === "bulgaria")
          .map((e) => e.id),
      ),
    ),
  ];
  for (const target of targets)
    addArmy(w, "bulgaria", target).organization = 45;
  w = order(w, { type: "commanderDeploy", general, target: "bulgaria" });
  w = order(w, { type: "commanderStance", general, stance: "attack" });
  for (let i = 0; i < 60 && w.countries.turkey.casualties === 0; i++)
    landDays(w, 1);
  assert.ok(
    w.countries.turkey.casualties > 0,
    "Saldıran tümenler gerçekten savaşır",
  );
  assert.ok(w.countries.bulgaria.casualties > 0, "Savunucu gerçek hasar alır");
});

test("Hedefle savaş bitince veya başka sınır seçilince eski saldırı rotası devam etmez", () => {
  let w = fixture();
  declareWar(w, "turkey", "bulgaria");
  const general = w.armies[0].general!;
  for (const a of w.armies)
    a.province = commanderBorders(w, "turkey", "bulgaria")[0];
  w = order(w, { type: "commanderDeploy", general, target: "bulgaria" });
  w = order(w, { type: "commanderStance", general, stance: "attack" });
  commandersDay(w);
  w.countries.turkey.wars = [];
  w.countries.bulgaria.wars = [];
  commandersDay(w);
  assert.ok(
    w.armies.every((a) =>
      [...a.route, ...(a.move ? [a.move.to] : [])].every(
        (id) => w.provinces[id].controller !== "bulgaria",
      ),
    ),
  );
  w = order(w, { type: "commanderDeploy", general, target: "greece" });
  const front = w.countries.turkey.generals.find(
    (g) => g.id === general,
  )!.front!;
  assert.equal(front.target, "greece");
  assert.equal(front.stance, "defend");
  assert.ok(
    Object.values(front.assignments).every((id) =>
      commanderBorders(w, "turkey", "greece").includes(id),
    ),
  );
});
