import assert from "node:assert/strict";
import { test } from "node:test";
import { aiDay } from "./ai";
import { addArmy, createWorld, GEOGRAPHY, MAP } from "./world";

test("AI sends a reserve to the nearby border across the date line instead of the distant inland border", () => {
  const world = createWorld("turkey");
  const origin = "germany-0",
    close = "germany-1",
    distant = "germany-2",
    enemy = "france-0";
  const ids = [origin, close, distant, enemy];
  const original = ids.map((id) => ({
    id,
    x: GEOGRAPHY[id].x,
    y: GEOGRAPHY[id].y,
    neighbors: GEOGRAPHY[id].neighbors,
  }));
  const width = MAP.width;
  try {
    MAP.width = 6000;
    Object.assign(GEOGRAPHY[origin], {
      x: 10,
      y: 400,
      neighbors: [
        { id: close, sea: false },
        { id: distant, sea: false },
      ],
    });
    Object.assign(GEOGRAPHY[close], {
      x: 5990,
      y: 400,
      neighbors: [
        { id: origin, sea: false },
        { id: enemy, sea: false },
      ],
    });
    Object.assign(GEOGRAPHY[distant], {
      x: 600,
      y: 400,
      neighbors: [
        { id: origin, sea: false },
        { id: enemy, sea: false },
      ],
    });
    Object.assign(GEOGRAPHY[enemy], {
      x: 5980,
      y: 400,
      neighbors: [
        { id: close, sea: false },
        { id: distant, sea: false },
      ],
    });
    for (const province of Object.values(world.provinces))
      if (province.controller === "germany" && !ids.includes(province.id))
        province.controller = "turkey";
    for (const country of Object.values(world.countries)) {
      country.capitulated = country.id !== "germany";
      country.air.wings = [];
      country.navy.ships = [];
    }
    const country = world.countries.germany;
    country.wars = ["france"];
    world.countries.france.wars = ["germany"];
    country.manpower = 0;
    country.treasury = 0;
    country.political = 0;
    country.allies = [];
    const army = world.armies.find((army) => army.country === country.id)!;
    army.province = origin;
    army.general = country.generals[0].id;
    army.move = null;
    army.route = [];
    army.supply = 1;
    army.strength = 90;
    world.armies = [army];
    // This test measures the reserve's date-line route, not capital evacuation.
    addArmy(world, country.id, country.capital).strength = 100;
    const index = Object.keys(world.countries).indexOf(country.id);
    world.day = (7 - (index % 7)) % 7;
    aiDay(world);
    const ordered = world.armies.find((item) => item.id === army.id)!;
    assert.equal(ordered.route[0] ?? ordered.move?.to, close);
  } finally {
    MAP.width = width;
    for (const point of original)
      Object.assign(GEOGRAPHY[point.id], {
        x: point.x,
        y: point.y,
        neighbors: point.neighbors,
      });
  }
});
