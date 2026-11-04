import assert from "node:assert/strict";
import { test } from "node:test";
import { aiTacticsHour } from "./ai";
import { runCountryTactics } from "./ai-tactics";
import { createCommand, executeCommandInPlace } from "./commands";
import { declareWar } from "./diplomacy";
import { combatPower } from "./land";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { addArmy, createWorld, GEOGRAPHY } from "./world";
import type { World } from "./types";

function fixture(difficulty: World["difficulty"] = "hard") {
  const w = createWorld("turkey", "historical", 1936, difficulty);
  for (const c of Object.values(w.countries))
    c.capitulated =
      c.id !== "germany" && c.id !== "poland" && c.id !== w.player;
  declareWar(w, "germany", "poland");
  w.armies = [];
  w.countries.germany.recruitment = [];
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      p.country === "germany" &&
      p.id !== w.countries.germany.capital &&
      p.neighbors.some((e) => !e.sea && GEOGRAPHY[e.id].country === "poland"),
  )!;
  const targets = origin.neighbors
    .filter((e) => !e.sea && GEOGRAPHY[e.id].country === "poland")
    .map((e) => e.id);
  return {
    w,
    origin: origin.id,
    targets,
    capital: w.countries.germany.capital,
  };
}
const current = (w: World, id: string) => w.armies.find((a) => a.id === id)!;
const endpoint = (w: World, id: string) => {
  const a = current(w, id);
  return a.route.at(-1) ?? a.move?.to ?? a.province;
};

test("AI reserves its sole capital division even when the guard is understrength", () => {
  const { w, capital } = fixture();
  const guard = addArmy(w, "germany", capital);
  guard.strength = 0.2;
  guard.organization = 5;
  guard.supply = 0.2;
  const player = addArmy(w, w.player, w.countries[w.player].capital);
  const playerBefore = structuredClone(player);
  const finances = structuredClone(w.countries.germany);
  runCountryTactics(w, "germany");
  assert.equal(current(w, guard.id).province, capital);
  assert.deepEqual(current(w, guard.id).route, []);
  assert.equal(current(w, guard.id).move, null);
  assert.equal(current(w, guard.id).strength, 0.2);
  assert.equal(current(w, guard.id).stance, "hold");
  assert.deepEqual(w.countries.germany, finances);
  runCountryTactics(w, w.player, true);
  assert.deepEqual(current(w, player.id), playerBefore);
});

test("Capital guard cancels an outgoing route and is removed from an offensive plan", () => {
  const { w, capital, origin } = fixture();
  const guard = addArmy(w, "germany", capital);
  guard.route = [origin];
  w.plans.push({
    id: "guard-plan",
    country: "germany",
    name: "Old attack",
    armies: [guard.id],
    objectives: [origin],
    preparation: 100,
    active: true,
    stance: "aggressive",
  });
  runCountryTactics(w, "germany");
  assert.equal(current(w, guard.id).province, capital);
  assert.deepEqual(current(w, guard.id).route, []);
  assert.ok(w.plans.every((plan) => !plan.armies.includes(guard.id)));
  assert.ok(
    w.commandState!.receipts.some(
      (r) => r.action.type === "halt" && r.action.army === guard.id,
    ),
  );
});

test("An unguarded capital recalls a real survivor without teleporting or resetting its return progress", () => {
  const { w, capital, origin } = fixture();
  const army = addArmy(w, "germany", origin);
  runCountryTactics(w, "germany");
  assert.equal(current(w, army.id).province, origin);
  assert.equal(endpoint(w, army.id), capital);
  assert.equal(current(w, army.id).stance, "hold");
  const before = structuredClone(current(w, army.id));
  const cursor = w.commandState!.cursors.germany;
  runCountryTactics(w, "germany");
  assert.deepEqual(current(w, army.id), before);
  assert.equal(w.commandState!.cursors.germany, cursor);
});

test("Destroyed guard is replaced by an existing field division, never a new free army", () => {
  const { w, capital, origin } = fixture();
  const guard = addArmy(w, "germany", capital);
  const replacement = addArmy(w, "germany", origin);
  runCountryTactics(w, "germany");
  w.armies = w.armies.filter((a) => a.id !== guard.id);
  runCountryTactics(w, "germany");
  assert.equal(w.armies.length, 1);
  assert.equal(endpoint(w, replacement.id), capital);
  assert.equal(current(w, replacement.id).province, origin);
});

test("A country without a reachable survivor pays for one replacement training queue", () => {
  const { w, capital } = fixture();
  const c = w.countries.germany;
  c.manpower = 18000;
  c.equipment.rifle = 180;
  runCountryTactics(w, "germany");
  assert.equal(w.armies.length, 0);
  assert.equal(w.countries.germany.recruitment.length, 1);
  assert.equal(w.countries.germany.recruitment[0].province, capital);
  assert.equal(w.countries.germany.recruitment[0].type, "infantry");
  assert.equal(w.countries.germany.manpower, 9000);
  assert.equal(w.countries.germany.equipment.rifle, 90);
  runCountryTactics(w, "germany");
  assert.equal(w.countries.germany.recruitment.length, 1);
  assert.equal(w.countries.germany.manpower, 9000);
});

test("An isolated reserve stack cannot teleport home or trigger one failed path search per division", () => {
  const { w, capital, origin } = fixture();
  w.countries.germany.wars = [];
  w.countries.germany.manpower = 0;
  w.countries.germany.equipment.rifle = 0;
  for (let i = 0; i < 64; i++) addArmy(w, "germany", origin);
  const before = structuredClone(w.armies);
  const descriptor = Object.getOwnPropertyDescriptor(
    GEOGRAPHY[origin],
    "neighbors",
  )!;
  let searches = 0;
  Object.defineProperty(GEOGRAPHY[origin], "neighbors", {
    configurable: true,
    get() {
      searches++;
      return [];
    },
  });
  try {
    runCountryTactics(w, "germany");
    assert.deepEqual(w.armies, before);
    assert.equal(w.countries.germany.recruitment.length, 0);
    assert.equal(w.provinces[capital].controller, "germany");
    assert.ok(
      searches <= 2,
      "One shared supply pass and one disconnected route search suffice for the whole stack",
    );
  } finally {
    Object.defineProperty(GEOGRAPHY[origin], "neighbors", descriptor);
  }
});

test("Occupation prevents automatic capital repatriation, free capture and replacement training", () => {
  const { w, capital, origin } = fixture();
  w.provinces[capital].controller = "poland";
  const army = addArmy(w, "germany", origin);
  army.organization = 0;
  const armiesBefore = w.armies.length;
  runCountryTactics(w, "germany");
  assert.equal(w.provinces[capital].controller, "poland");
  assert.equal(w.armies.length, armiesBefore);
  assert.equal(w.countries.germany.recruitment.length, 0);
  assert.ok(
    current(w, army.id).route.every(
      (p) => w.provinces[p].controller === "germany",
    ),
  );
});

test("AI pools adjacent attackers against a defender that no individual infantry can beat", () => {
  const { w, capital, origin, targets } = fixture();
  const guard = addArmy(w, "germany", capital);
  const attackers = Array.from({ length: 3 }, () =>
    addArmy(w, "germany", origin),
  );
  const victim = targets[0];
  for (const target of targets) {
    const defender = addArmy(
      w,
      "poland",
      target,
      target === victim ? "infantry" : "heavyTank",
    );
    defender.organization = 100;
    if (target === victim) defender.strength = 80;
    else for (let i = 0; i < 8; i++) addArmy(w, "poland", target, "heavyTank");
  }
  const defender = w.armies.find(
    (a) => a.country === "poland" && a.province === victim,
  )!;
  const defense = combatPower(w, defender, false, victim);
  assert.ok(attackers.every((a) => combatPower(w, a, true, victim) < defense));
  assert.ok(
    attackers.reduce((n, a) => n + combatPower(w, a, true, victim), 0) >
      defense * 1.05,
  );
  runCountryTactics(w, "germany");
  assert.ok(attackers.every((a) => endpoint(w, a.id) === victim));
  assert.deepEqual(current(w, guard.id).route, []);
  const group = w.commandState!.receipts.find(
    (r) => r.action.type === "moveGroup",
  );
  assert.ok(group);
  assert.equal(
    new Set(attackers.map((a) => current(w, a.id).marchGroup)).size,
    1,
  );
  assert.notEqual(
    current(w, attackers[0].id).route,
    current(w, attackers[1].id).route,
  );
});

test("AI holds an unwinnable front even on hard and retains its capital guard", () => {
  const { w, capital, origin, targets } = fixture();
  const guard = addArmy(w, "germany", capital);
  const attacker = addArmy(w, "germany", origin);
  for (const target of targets)
    for (let i = 0; i < 8; i++) addArmy(w, "poland", target, "heavyTank");
  runCountryTactics(w, "germany");
  assert.deepEqual(current(w, attacker.id).route, []);
  assert.deepEqual(current(w, guard.id).route, []);
});

test("Rear formations spread across multiple reachable borders and count forces already traveling there", () => {
  const { w, capital } = fixture();
  const guard = addArmy(w, "germany", capital);
  const reserves = Array.from({ length: 16 }, () =>
    addArmy(w, "germany", capital),
  );
  runCountryTactics(w, "germany");
  const assignments = reserves.map((a) => endpoint(w, a.id));
  assert.ok(new Set(assignments).size > 1);
  assert.ok(assignments.every((p) => p !== capital));
  assert.deepEqual(current(w, guard.id).route, []);
  const reinforcement = addArmy(w, "germany", capital);
  runCountryTactics(w, "germany");
  assert.notEqual(endpoint(w, reinforcement.id), capital);
  assert.ok(validateWorld(w));
});

test("Hard tactics respond between weekly turns without running research or economy", () => {
  const { w, capital, origin } = fixture("hard");
  w.countries.poland.capitulated = true;
  const guard = addArmy(w, "germany", origin);
  const index = Object.keys(w.countries).indexOf("germany");
  w.day = 10;
  w.hour = (6 - (index % 6)) % 6 || 6;
  const easy = structuredClone(w);
  easy.difficulty = "easy";
  // Pick a hard-only scheduled hour, independent of country insertion index.
  while ((w.day * 24 + w.hour + index) % 24 === 0) w.hour += 6;
  easy.hour = w.hour;
  aiTacticsHour(easy);
  assert.deepEqual(current(easy, guard.id).route, []);
  const countryBefore = structuredClone(w.countries.germany);
  aiTacticsHour(w);
  assert.equal(endpoint(w, guard.id), capital);
  assert.deepEqual(w.countries.germany, countryBefore);
  assert.ok(w.commandState!.receipts.every((r) => r.action.type === "move"));
});

test("Tactical replay after save/load is deterministic and does not overwrite player orders", () => {
  const { w, capital } = fixture();
  addArmy(w, "germany", capital);
  for (let i = 0; i < 5; i++) addArmy(w, "germany", capital);
  const player = addArmy(w, w.player, w.countries[w.player].capital);
  const ownedNeighbor = GEOGRAPHY[player.province].neighbors.find(
    (e) => !e.sea && w.provinces[e.id].controller === w.player,
  )!;
  executeCommandInPlace(
    w,
    createCommand(w, { type: "move", army: player.id, to: ownedNeighbor.id }),
    w.player,
  );
  const playerBefore = structuredClone(current(w, player.id));
  const restored = decodeSave(encodeSave(w));
  runCountryTactics(w, "germany");
  runCountryTactics(restored, "germany");
  assert.deepEqual(restored, w);
  assert.deepEqual(current(w, player.id), playerBefore);
  assert.ok(validateWorld(w));
});
