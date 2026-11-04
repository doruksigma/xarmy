import { manage } from "./management";
import { COMMANDER_CAPACITY } from "./commander-roster";
import { createCommand, executeCommandInPlace } from "./commands";
import { seaEdgeOpen } from "./military-assets";
import { focusTree, TECHNOLOGIES } from "./catalog";
import { diplomaticAcceptance } from "./diplomacy";
import { combatPower } from "./land";
import { mapDistance } from "./geography-distance";
import { researchSlots } from "./politics";
import {
  atWar,
  controlled,
  friendly,
  GEOGRAPHY,
  localSupply,
  militaryPower,
  supplyNetwork,
} from "./world";
import type { Action, Army, World } from "./types";

/** AI decisions use stocks, local force ratios, supply, diplomatic threats and
 * research prerequisites. No hidden resources or random auto-capture. */
export function aiDay(w: World) {
  // IDs survive copy-on-write command publication; cached entity objects do not.
  for (const [index, countryId] of Object.keys(w.countries).entries()) {
    let c = w.countries[countryId];
    if (c.id === w.player || c.capitulated || (w.day + index) % 7 !== 0)
      continue;
    const submit = (action: Action): boolean => {
      const result = executeCommandInPlace(
        w,
        createCommand(w, action, countryId),
        countryId,
      );
      // Commands may replace this country and its armies. Never spend against
      // an object from before the previous command or pass it into management.
      c = w.countries[countryId];
      return result.status === "applied" || result.status === "duplicate";
    };
    let lands = controlled(w, countryId);
    if (!lands.length) continue;
    const armies = () => w.armies.filter((army) => army.country === countryId);
    const threat = () => c.wars.length > 0;
    if (c.research.length < researchSlots(c)) {
      const priority = threat()
        ? [
            "landDoctrine",
            "weapons1",
            "armor1",
            "logistics",
            "industry1",
            "motorization",
            "weapons2",
          ]
        : [
            "industry1",
            "motorization",
            "weapons1",
            "armor1",
            "logistics",
            "aviation2",
            "industry2",
          ];
      const options = TECHNOLOGIES.filter(
        (t) =>
          !c.tech.includes(t.id) &&
          !c.research.some((r) => r.id === t.id) &&
          t.requires.every((id) => c.tech.includes(id)),
      );
      options.sort((a, b) => {
        const rank = (id: string) =>
          priority.includes(id) ? priority.indexOf(id) : 100;
        return rank(a.id) - rank(b.id) || a.year - b.year;
      });
      if (options[0]) submit({ type: "research", id: options[0].id });
    }
    if (!c.focus) {
      const focus = focusTree(c.id).find(
        (f) =>
          !c.focuses.includes(f.id) &&
          f.requires.every((id) => c.focuses.includes(id)) &&
          (!f.excludes || !c.focuses.includes(f.excludes)),
      );
      if (focus) submit({ type: "focus", id: focus.id });
    }
    if (c.construction.length === 0 && c.treasury > 250) {
      const border = lands.find((p) =>
        GEOGRAPHY[p.id].neighbors.some((n) =>
          atWar(w, c.id, w.provinces[n.id].controller),
        ),
      );
      const lowSupply = armies().find(
        (a) => a.supply < 0.7 && w.provinces[a.province].controller === c.id,
      );
      const choice = lowSupply
        ? { province: lowSupply.province, building: "rail" as const }
        : c.stock.rubber < 20
          ? { province: c.capital, building: "synthetic" as const }
          : threat() && border && border.buildings.fort < 2
            ? { province: border.id, building: "fort" as const }
            : {
                province: lands.sort(
                  (a, b) => a.buildings.civil - b.buildings.civil,
                )[0].id,
                building: threat() ? ("military" as const) : ("civil" as const),
              };
      submit({ type: "build", ...choice });
    }
    // Share the finite-pool allocation with the player's optional assistant.
    // Deployed aircraft and ships count toward goals, so commissioning assets
    // cannot trigger endless replacement production and starve the land army.
    manage(w, c, "economy", submit);
    if (threat() && c.economy !== "war")
      submit({ type: "economy", law: "war" });
    if (c.manpower < 12000 && c.conscription !== "extensive")
      submit({
        type: "conscription",
        law: c.conscription === "volunteer" ? "limited" : "extensive",
      });
    if (
      c.recruitment.length < 2 &&
      armies().length < Math.min(32, lands.length * 3)
    ) {
      const type =
        c.tech.includes("armor2") && c.equipment.mediumTank >= 45
          ? "mediumTank"
          : c.tech.includes("armor1") && c.equipment.lightTank >= 45
            ? "lightTank"
            : c.equipment.artillery >= 24
              ? "artillery"
              : "infantry";
      submit({ type: "recruit", unit: type, province: c.capital });
    }
    for (const r of ["oil", "rubber", "steel"] as const)
      if (
        c.stock[r] < 15 &&
        !w.trades.some((t) => t.to === c.id && t.resource === r)
      ) {
        const seller = Object.values(w.countries)
          .filter(
            (t) =>
              t !== c &&
              !t.capitulated &&
              !atWar(w, c.id, t.id) &&
              !t.embargoes.includes(c.id) &&
              t.stock[r] > 70 &&
              (t.relations[c.id] ?? 0) > -30,
          )
          .sort((a, b) => b.stock[r] - a.stock[r])[0];
        if (seller && c.treasury > 100)
          submit({ type: "trade", target: seller.id, resource: r, amount: 3 });
      }
    if (c.wars.length) {
      const strongest = [...c.wars].sort(
        (a, b) => militaryPower(w, b) - militaryPower(w, a),
      )[0];
      if (
        c.exhaustion > 45 &&
        militaryPower(w, c.id) < militaryPower(w, strongest) * 0.65
      )
        submit({ type: "diplomacy", target: strongest, kind: "peace" });
      const ally = Object.values(w.countries).find(
        (t) =>
          t !== c &&
          !t.capitulated &&
          !c.allies.includes(t.id) &&
          !atWar(w, c.id, t.id) &&
          t.wars.some((id) => c.wars.includes(id)) &&
          diplomaticAcceptance(w, c.id, t.id) >= 55,
      );
      if (ally)
        submit({ type: "diplomacy", target: ally.id, kind: "alliance" });
    } else if (
      w.mode === "alternative" &&
      !c.subjectOf &&
      w.day > 90 &&
      ["fascism", "communism"].includes(c.ideology)
    ) {
      const neighbors = new Set(
        lands.flatMap((p) =>
          GEOGRAPHY[p.id].neighbors
            .filter((e) => !e.sea)
            .map((e) => w.provinces[e.id].controller),
        ),
      );
      const target = [...neighbors]
        .map((id) => w.countries[id])
        .filter(
          (t) =>
            t !== c &&
            !t.capitulated &&
            !c.allies.includes(t.id) &&
            (c.pacts[t.id] ?? 0) <= w.day &&
            (c.relations[t.id] ?? 0) < 15,
        )
        .sort((a, b) => militaryPower(w, a.id) - militaryPower(w, b.id))[0];
      if (target) {
        const enemyPower =
          militaryPower(w, target.id) +
          target.allies.reduce((n, id) => n + militaryPower(w, id) * 0.65, 0);
        if (
          militaryPower(w, c.id) >
            enemyPower *
              (target.id === w.player && w.difficulty === "easy" ? 2.2 : 1.4) &&
          armies().every((a) => a.supply > 0.6)
        )
          submit({
            type: "diplomacy",
            target: target.id,
            kind: c.claims.includes(target.id) ? "war" : "justify",
          });
      }
    }
    manage(w, c, "operations", submit);
    // Peace, alliances and asset orders can change access and controlled land.
    lands = controlled(w, countryId);
    // Diplomacy and asset orders are settled before reusing this network.
    let network: Set<string> | undefined;
    const supplies = new Map<string, number>();
    const supplyAt = (province: string) => {
      network ??= supplyNetwork(w, c.id);
      if (!supplies.has(province))
        supplies.set(province, localSupply(w, c.id, province, network));
      return supplies.get(province)!;
    };
    // This pass only changes orders and generals; locations and enemy combat
    // strength remain fixed until the next country takes its turn.
    const byProvince = new Map<string, Army[]>(),
      ownCounts = new Map<string, number>(),
      armyIndices = new Map<string, number>(),
      commanderCounts = new Map<string, number>(),
      defenses = new Map<string, number>();
    for (const [armyIndex, a] of w.armies.entries()) {
      const at = byProvince.get(a.province);
      if (at) at.push(a);
      else byProvince.set(a.province, [a]);
      if (a.country === c.id) {
        ownCounts.set(a.province, (ownCounts.get(a.province) ?? 0) + 1);
        armyIndices.set(a.id, armyIndex);
        if (a.general)
          commanderCounts.set(
            a.general,
            (commanderCounts.get(a.general) ?? 0) + 1,
          );
      }
    }
    const borders = threat()
      ? lands.filter((p) =>
          GEOGRAPHY[p.id].neighbors.some((e) =>
            atWar(w, c.id, w.provinces[e.id].controller),
          ),
        )
      : [];
    // Shared origins and goals use one atomic group order. This avoids opening
    // a separate copy-on-write transaction for every stacked division.
    const movements = new Map<
      string,
      { armies: string[]; to: string; stance: "hold" | "advance" }
    >();
    const queueMove = (
      army: Army,
      to: string,
      stance: "hold" | "advance" = "advance",
    ) => {
      const key = `${army.province}:${to}:${stance}`;
      const group = movements.get(key);
      if (group) group.armies.push(army.id);
      else movements.set(key, { armies: [army.id], to, stance });
    };
    // General and movement orders do not add, remove or reorder armies. Read
    // the live array at its stable index after every copy-on-write command.
    for (const [armyId, armyIndex] of armyIndices) {
      let a = w.armies[armyIndex];
      if (a.move || a.route.length) continue;
      if (!a.general) {
        const preferred = c.generals[a.type === "infantry" ? 0 : 1];
        let available =
          preferred &&
          (commanderCounts.get(preferred.id) ?? 0) < COMMANDER_CAPACITY
            ? preferred.id
            : c.generals.find(
                (general) =>
                  (commanderCounts.get(general.id) ?? 0) < COMMANDER_CAPACITY,
              )?.id;
        if (!available && submit({ type: "commanderCreate" }))
          available = c.generals.at(-1)?.id;
        if (
          available &&
          submit({ type: "general", army: armyId, general: available })
        ) {
          const assigned = w.armies[armyIndex].general;
          if (assigned)
            commanderCounts.set(
              assigned,
              (commanderCounts.get(assigned) ?? 0) + 1,
            );
        }
        a = w.armies[armyIndex];
        if (a.move || a.route.length) continue;
      }
      const adjacent = GEOGRAPHY[a.province].neighbors.filter(
          (e) =>
            !e.sea ||
            (a.organization >= 70 && seaEdgeOpen(w, c.id, a.province, e.id)),
        ),
        enemies = adjacent.filter((e) =>
          atWar(w, c.id, w.provinces[e.id].controller),
        );
      if (a.organization < 30 || a.supply < 0.35 || a.strength < 35) {
        const rear = adjacent
          .filter((e) => friendly(w, c.id, w.provinces[e.id].controller))
          .sort((l, r) => supplyAt(r.id) - supplyAt(l.id));
        if (
          rear[0] &&
          (enemies.length ||
            (a.supply < 0.35 && supplyAt(rear[0].id) > a.supply))
        ) {
          queueMove(a, rear[0].id, "hold");
        }
        continue;
      }
      if (enemies.length) {
        const ranked = enemies
          .map((e) => {
            if (!defenses.has(e.id))
              defenses.set(
                e.id,
                (byProvince.get(e.id) ?? [])
                  .filter((t) => atWar(w, c.id, t.country))
                  .reduce((n, t) => n + combatPower(w, t, false, e.id), 0),
              );
            const def = defenses.get(e.id)!;
            const atk = combatPower(w, a, true, e.id);
            return {
              id: e.id,
              ratio: atk / Math.max(1, def),
              value: GEOGRAPHY[e.id].vp,
            };
          })
          .filter(
            (e) =>
              e.ratio >
              (w.provinces[e.id].controller === w.player &&
              w.difficulty === "easy"
                ? 1.4
                : 1.05),
          )
          .sort((l, r) => r.ratio * r.value - l.ratio * l.value);
        if (ranked[0]) {
          queueMove(a, ranked[0].id);
        }
        continue;
      }
      if (threat()) {
        let border: (typeof borders)[number] | undefined,
          bestScore = Infinity;
        for (const p of borders) {
          const score =
            (ownCounts.get(p.id) ?? 0) * 100 +
            mapDistance(GEOGRAPHY[a.province], GEOGRAPHY[p.id]);
          if (score < bestScore) {
            border = p;
            bestScore = score;
          }
        }
        if (border && border.id !== a.province) queueMove(a, border.id);
      }
    }
    // Even maximum-length persisted IDs stay below the command payload limit.
    for (const group of movements.values())
      for (let offset = 0; offset < group.armies.length; offset += 512) {
        const ids = group.armies.slice(offset, offset + 512);
        submit(
          ids.length === 1
            ? { type: "move", army: ids[0], to: group.to, stance: group.stance }
            : {
                type: "moveGroup",
                armies: ids,
                to: group.to,
                stance: group.stance,
              },
        );
      }
  }
}
