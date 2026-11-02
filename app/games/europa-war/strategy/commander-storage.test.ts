import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, GEOGRAPHY } from "./world";
import { decodeSave, encodeSave, validateWorld } from "./storage";
import { COMMANDER_CAPACITY, MAX_COMMANDERS } from "./commander-roster";
import type { World } from "./types";

function withCommander() {
  const world = createWorld("turkey");
  const country = world.countries.turkey;
  const general = country.generals[0];
  const army = world.armies.find((a) => a.country === country.id)!;
  army.general = general.id;
  general.front = {
    target: "bulgaria",
    stance: "defend",
    assignments: { [army.id]: army.province },
  };
  country.autoAssignCommanders = true;
  return { world, country, general, army };
}

function legacyWorld(members = 29): World {
  const world = createWorld("turkey");
  for (const country of Object.values(world.countries)) {
    delete country.autoAssignCommanders;
    for (const general of country.generals) delete general.front;
  }
  const country = world.countries.turkey;
  const original = world.armies.find((a) => a.country === country.id)!;
  const next = GEOGRAPHY[original.province].neighbors.find(
    (edge) => !edge.sea && world.provinces[edge.id].controller === country.id,
  )!.id;
  world.armies = world.armies.filter((a) => a.country !== country.id);
  for (let index = 0; index < members; index++) {
    world.armies.push({
      ...structuredClone(original),
      id: `legacy-commander-army-${index}`,
      general: country.generals[0].id,
      strength: 65 + index / 10,
      organization: 72,
      experience: 12,
      move: { to: next, progress: 0.25, days: 3 },
      route: [],
      stance: "advance",
    });
  }
  return world;
}

test("Komutan hedefi, saldırı/savunma emri ve otomatik atama ayarı kayıt dönüşünde korunur", () => {
  const { world, country, general } = withCommander();
  for (const stance of ["defend", "attack"] as const) {
    for (const enabled of [false, true]) {
      general.front!.stance = stance;
      country.autoAssignCommanders = enabled;
      assert.ok(validateWorld(world));
      assert.deepEqual(decodeSave(encodeSave(world)), world);
    }
  }
});

test("On komutandan büyük geçerli kadro ve boşta yeni komutanlar kaydedilebilir", () => {
  const { world, country } = withCommander();
  for (let index = 0; index < 20; index++) {
    country.generals.push({
      id: `new-idle-general-${index}`,
      name: `${index + 1}. Komutan`,
      skill: 1,
      xp: 0,
      trait: "defense",
    });
  }
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Kayıt komutan kadrosu motorun güvenli üst sınırını aşamaz", () => {
  const { world, country } = withCommander();
  while (country.generals.length < MAX_COMMANDERS) {
    country.generals.push({
      id: `bounded-general-${country.generals.length}`,
      name: "Yedek komutan",
      skill: 1,
      xp: 0,
      trait: "defense",
    });
  }
  assert.ok(validateWorld(world));
  country.generals.push({ ...country.generals.at(-1)!, id: "one-too-many" });
  assert.equal(validateWorld(world), false);
  assert.throws(() => decodeSave(encodeSave(world)));
});

test("Komutan kaydındaki yabancı birlikler, bozuk hedefler ve beklenmeyen alanlar reddedilir", () => {
  const mutations: ((world: World) => void)[] = [
    (w) => {
      w.countries.turkey.generals[0].front!.target = "turkey";
    },
    (w) => {
      w.countries.turkey.generals[0].front!.target = "unknown-country";
    },
    (w) => {
      Object.assign(w.countries.turkey.generals[0].front!, {
        stance: "teleport",
      });
    },
    (w) => {
      const foreign = w.armies.find((a) => a.country === "germany")!;
      w.countries.turkey.generals[0].front!.assignments = {
        [foreign.id]: "turkey-0",
      };
    },
    (w) => {
      const army = w.armies.find((a) => a.country === "turkey")!;
      army.general = w.countries.turkey.generals[1].id;
    },
    (w) => {
      w.countries.turkey.generals[0].front!.assignments = {
        "missing-army": "turkey-0",
      };
    },
    (w) => {
      const army = w.armies.find((a) => a.country === "turkey")!;
      w.countries.turkey.generals[0].front!.assignments = {
        [army.id]: "missing-province",
      };
    },
    (w) => {
      w.countries.turkey.generals[1].id = w.countries.turkey.generals[0].id;
    },
    (w) => {
      Object.assign(w.countries.turkey.generals[0].front!, {
        hiddenOrder: "attack",
      });
    },
    (w) => {
      Object.assign(w.countries.turkey, { autoAssignCommanders: "yes" });
    },
    (w) => {
      Object.assign(w.countries.turkey, { unknownCommanderSwitch: true });
    },
    (w) => {
      Object.defineProperty(
        w.countries.turkey.generals[0].front!.assignments,
        "__proto__",
        {
          enumerable: true,
          value: "turkey-0",
        },
      );
    },
  ];
  for (const mutate of mutations) {
    const { world } = withCommander();
    mutate(world);
    assert.equal(validateWorld(world), false);
    assert.throws(() => decodeSave(encodeSave(world)));
  }
});

test("Şehir el değiştirince var olan komutan kaydı bozuk sayılmaz", () => {
  const { world, army } = withCommander();
  // A capture can occur in the same tick as a commander assignment. On load,
  // normal order reconciliation decides the new front; the reference is valid.
  world.provinces[army.province].controller = "bulgaria";
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Yeni biçimde 12 tümen sınırı aşılmışsa yükleme sessizce onarım yapmaz", () => {
  const world = legacyWorld(COMMANDER_CAPACITY + 1);
  world.countries.turkey.autoAssignCommanders = false;
  assert.equal(validateWorld(world), false);
  assert.throws(() => decodeSave(encodeSave(world)));
});

test("Eski 29 tümenli komutan 12/12/5 olarak ayrılır, birlikler ve yürüyüş emirleri korunur", () => {
  const original = legacyWorld();
  const unchanged = structuredClone(original);
  const loaded = decodeSave(encodeSave(original));
  assert.deepEqual(original, unchanged);
  assert.ok(validateWorld(loaded));
  const country = loaded.countries.turkey;
  assert.equal(country.autoAssignCommanders, false);
  const members = loaded.armies.filter((a) => a.country === country.id);
  const sizes = country.generals.map(
    (g) => members.filter((a) => a.general === g.id).length,
  );
  assert.deepEqual(sizes.filter(Boolean), [12, 12, 5]);
  const stripGeneral = (army: World["armies"][number]) => {
    const result = { ...army };
    Reflect.deleteProperty(result, "general");
    return result;
  };
  assert.deepEqual(
    loaded.armies.map(stripGeneral),
    original.armies.map(stripGeneral),
  );
  assert.ok(country.generals.every((g) => !g.front));
  for (const general of country.generals.slice(2)) {
    assert.equal(general.skill, original.countries.turkey.generals[0].skill);
    assert.equal(general.trait, original.countries.turkey.generals[0].trait);
  }
  assert.deepEqual(decodeSave(encodeSave(loaded)), loaded);
});

test("Eski ve zaten kapasiteye uygun kayıt gereksizce değiştirilmez", () => {
  const world = legacyWorld(COMMANDER_CAPACITY);
  assert.ok(validateWorld(world));
  assert.deepEqual(decodeSave(encodeSave(world)), world);
});

test("Eski bölge haritası ve büyük komutan grubu aynı kayıt yüklemesinde taşınır", () => {
  const world = legacyWorld();
  for (const id of Object.keys(world.provinces))
    if (GEOGRAPHY[id].legacyRegion !== id) delete world.provinces[id];
  for (const army of world.armies) {
    army.province = GEOGRAPHY[army.province].legacyRegion;
    army.route = army.route.map((id) => GEOGRAPHY[id].legacyRegion);
    if (army.move) army.move.to = GEOGRAPHY[army.move.to].legacyRegion;
  }
  for (const country of Object.values(world.countries)) {
    for (const wing of country.air.wings) {
      wing.base = GEOGRAPHY[wing.base].legacyRegion;
      wing.target = GEOGRAPHY[wing.target].legacyRegion;
    }
    for (const ship of country.navy.ships)
      ship.port = GEOGRAPHY[ship.port].legacyRegion;
  }
  const loaded = decodeSave(encodeSave(world));
  assert.ok(validateWorld(loaded));
  assert.equal(
    Object.keys(loaded.provinces).length,
    Object.keys(GEOGRAPHY).length,
  );
  const members = loaded.armies.filter((a) => a.country === "turkey");
  assert.equal(members.length, 29);
  assert.deepEqual(
    loaded.countries.turkey.generals
      .map((g) => members.filter((a) => a.general === g.id).length)
      .filter(Boolean),
    [12, 12, 5],
  );
});

test("Eksik şehirli veya çakışan komutanlı eski kayıt kapasite aktarımıyla gizlenmez", () => {
  for (const kind of ["province", "general"] as const) {
    const world = legacyWorld();
    if (kind === "province") delete world.provinces["turkey-0"];
    else
      world.countries.turkey.generals[1].id =
        world.countries.turkey.generals[0].id;
    assert.throws(() => decodeSave(encodeSave(world)));
  }
});
