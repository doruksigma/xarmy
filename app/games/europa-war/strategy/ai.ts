import { manage } from "./management";
import { seaEdgeOpen } from "./military-assets";
import { focusTree, TECHNOLOGIES } from "./catalog";
import { diplomaticAcceptance, diplomaticAction } from "./diplomacy";
import { economyAction } from "./economy";
import { combatPower, routeTo } from "./land";
import { politicsAction, researchSlots } from "./politics";
import {
  atWar,
  controlled,
  friendly,
  GEOGRAPHY,
  localSupply,
  militaryPower,
  supplyNetwork,
} from "./world";
import type { World } from "./types";

/** AI decisions use stocks, local force ratios, supply, diplomatic threats and
 * research prerequisites. No hidden resources or random auto-capture. */
export function aiDay(w: World) {
  for (const [index, c] of Object.values(w.countries).entries()) {
    if (c.id === w.player || c.capitulated || (w.day + index) % 7 !== 0)
      continue;
    const attempt = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
    };
    const lands = controlled(w, c.id);
    if (!lands.length) continue;
    const armies = w.armies.filter((a) => a.country === c.id);
    const threat = c.wars.length > 0;
    if (c.research.length < researchSlots(c)) {
      const priority = threat
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
      if (options[0])
        attempt(() =>
          politicsAction(w, c, { type: "research", id: options[0].id }),
        );
    }
    if (!c.focus) {
      const focus = focusTree(c.id).find(
        (f) =>
          !c.focuses.includes(f.id) &&
          f.requires.every((id) => c.focuses.includes(id)) &&
          (!f.excludes || !c.focuses.includes(f.excludes)),
      );
      if (focus)
        attempt(() => politicsAction(w, c, { type: "focus", id: focus.id }));
    }
    if (c.construction.length === 0 && c.treasury > 250) {
      const border = lands.find((p) =>
        GEOGRAPHY[p.id].neighbors.some((n) =>
          atWar(w, c.id, w.provinces[n.id].controller),
        ),
      );
      const lowSupply = armies.find(
        (a) => a.supply < 0.7 && w.provinces[a.province].controller === c.id,
      );
      const choice = lowSupply
        ? { province: lowSupply.province, building: "rail" as const }
        : c.stock.rubber < 20
          ? { province: c.capital, building: "synthetic" as const }
          : threat && border && border.buildings.fort < 2
            ? { province: border.id, building: "fort" as const }
            : {
                province: lands.sort(
                  (a, b) => a.buildings.civil - b.buildings.civil,
                )[0].id,
                building: threat ? ("military" as const) : ("civil" as const),
              };
      attempt(() => economyAction(w, c, { type: "build", ...choice }));
    }
    // Share the finite-pool allocation with the player's optional assistant.
    // Deployed aircraft and ships count toward goals, so commissioning assets
    // cannot trigger endless replacement production and starve the land army.
    manage(w, c, "economy");
    if (threat && c.economy !== "war")
      attempt(() => economyAction(w, c, { type: "economy", law: "war" }));
    if (c.manpower < 12000 && c.conscription !== "extensive")
      attempt(() =>
        economyAction(w, c, {
          type: "conscription",
          law: c.conscription === "volunteer" ? "limited" : "extensive",
        }),
      );
    if (
      c.recruitment.length < 2 &&
      armies.length < Math.min(32, lands.length * 3)
    ) {
      const type =
        c.tech.includes("armor2") && c.equipment.mediumTank >= 45
          ? "mediumTank"
          : c.tech.includes("armor1") && c.equipment.lightTank >= 45
            ? "lightTank"
            : c.equipment.artillery >= 24
              ? "artillery"
              : "infantry";
      attempt(() =>
        economyAction(w, c, {
          type: "recruit",
          unit: type,
          province: c.capital,
        }),
      );
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
          attempt(() =>
            economyAction(w, c, {
              type: "trade",
              target: seller.id,
              resource: r,
              amount: 3,
            }),
          );
      }
    if (c.wars.length) {
      const strongest = [...c.wars].sort(
        (a, b) => militaryPower(w, b) - militaryPower(w, a),
      )[0];
      if (
        c.exhaustion > 45 &&
        militaryPower(w, c.id) < militaryPower(w, strongest) * 0.65
      )
        attempt(() => diplomaticAction(w, c, strongest, "peace"));
      const ally = Object.values(w.countries).find(
        (t) =>
          t !== c &&
          !t.capitulated &&
          !c.allies.includes(t.id) &&
          !atWar(w, c.id, t.id) &&
          t.wars.some((id) => c.wars.includes(id)) &&
          diplomaticAcceptance(w, c.id, t.id) >= 55,
      );
      if (ally) attempt(() => diplomaticAction(w, c, ally.id, "alliance"));
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
          armies.every((a) => a.supply > 0.6)
        )
          attempt(() =>
            diplomaticAction(
              w,
              c,
              target.id,
              c.claims.includes(target.id) ? "war" : "justify",
            ),
          );
      }
    }
    manage(w, c, "operations");
    // Diplomacy and asset orders are settled before reusing this network.
    let network: Set<string> | undefined;
    const supplyAt = (province: string) => {
      network ??= supplyNetwork(w, c.id);
      return localSupply(w, c.id, province, network);
    };
    for (const a of armies) {
      if (a.move || a.route.length) continue;
      if (!a.general) a.general = c.generals[a.type === "infantry" ? 0 : 1].id;
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
        if (rear[0] && enemies.length) {
          a.route = [rear[0].id];
          a.stance = "hold";
        }
        continue;
      }
      if (enemies.length) {
        const ranked = enemies
          .map((e) => {
            const defenders = w.armies.filter(
              (t) => t.province === e.id && atWar(w, c.id, t.country),
            );
            const def = defenders.reduce(
              (n, t) => n + combatPower(w, t, false, e.id),
              0,
            );
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
          a.route = [ranked[0].id];
          a.stance = "advance";
        }
        continue;
      }
      if (threat) {
        const borders = controlled(w, c.id).filter((p) =>
          GEOGRAPHY[p.id].neighbors.some((e) =>
            atWar(w, c.id, w.provinces[e.id].controller),
          ),
        );
        borders.sort((l, r) => {
          const score = (p: typeof l) =>
            w.armies.filter((t) => t.country === c.id && t.province === p.id)
              .length *
              100 +
            Math.hypot(
              GEOGRAPHY[a.province].x - GEOGRAPHY[p.id].x,
              GEOGRAPHY[a.province].y - GEOGRAPHY[p.id].y,
            );
          return score(l) - score(r);
        });
        const route = borders[0] ? routeTo(w, a, borders[0].id) : null;
        if (route) a.route = route;
      }
    }
  }
}
