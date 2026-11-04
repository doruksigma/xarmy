import { manage } from "./management";
import { createCommand, executeCommandInPlace } from "./commands";
import { focusTree, TECHNOLOGIES } from "./catalog";
import { diplomaticAcceptance } from "./diplomacy";
import { researchSlots } from "./politics";
import { atWar, controlled, GEOGRAPHY, militaryPower } from "./world";
import { runCountryTactics } from "./ai-tactics";
import { worldHour } from "./time";
import type { Action, World } from "./types";

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
    const lands = controlled(w, countryId);
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
    runCountryTactics(w, countryId, true);
  }
}

/** Cheap, staggered tactical responses are independent of weekly budgeting.
 * Saved campaign time determines the schedule; no timers, RNG or extra save fields. */
export function aiTacticsHour(w: World) {
  const hour = worldHour(w);
  for (const [index, id] of Object.keys(w.countries).entries()) {
    const country = w.countries[id];
    if (id === w.player || country.capitulated) continue;
    // aiDay has already handled this country's orders at this midnight.
    if ((w.hour ?? 0) === 0 && (w.day + index) % 7 === 0) continue;
    const cadence = country.wars.length
      ? { easy: 24, normal: 12, hard: 6 }[w.difficulty]
      : 24;
    if ((hour + index) % cadence === 0) runCountryTactics(w, id);
  }
}
