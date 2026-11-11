import assert from "node:assert/strict";
import test from "node:test";
import atlas from "./map-data.json";
import { focusTree, TECHNOLOGIES } from "./catalog";
import {
  allCountryEvents,
  countryEvents,
  HISTORICAL_EVENTS,
  historicalEvent,
  historicalFocusId,
} from "./historical-catalog";

test("92 senaryo ülkesinin her birinde en az 100 uygulanabilir tanımlı olay vardır", () => {
  assert.equal(atlas.countries.length, 92);
  const all = allCountryEvents();
  assert.equal(all.length, 10176);
  assert.equal(new Set(all.map((event) => event.id)).size, all.length);
  for (const country of atlas.countries) {
    const events = countryEvents(country.id);
    assert.ok(events.length >= 100, `${country.id}: ${events.length}`);
    assert.equal(events.filter((event) => event.era === "policy").length, 100);
    assert.equal(
      new Set(events.map((event) => event.title)).size,
      events.length,
      country.id,
    );
    assert.ok(events.every((event) => event.country === country.id));
    assert.ok(events.every((event) => event.cost > 0 && event.days > 0));
    for (const event of events.filter((item) => item.kind === "domestic")) {
      assert.ok(event.domestic?.effects.length, event.id);
      assert.ok(event.effectText.includes("Kabulde"), event.id);
      assert.ok(
        event.era === "policy" || event.era === "alternative",
        event.id,
      );
    }
  }
});

test("Almanya'nın 50 ayrı yazılmış özel olayı ve gerçek iç savaş sonrası imparatorluk yolu vardır", () => {
  const events = countryEvents("germany");
  assert.equal(events.length, 157);
  const special = events.filter(
    (event) => event.countrySpecific && event.kind === "domestic",
  );
  assert.equal(special.length, 50);
  const uprising = historicalEvent("national-germany-monarchist-uprising")!;
  assert.equal(uprising.domestic!.effects[0].kind, "uprising");
  assert.ok(
    uprising.requires.includes("history-national-germany-dynastic-petition"),
  );
  const empire = historicalEvent("national-germany-restore-empire")!;
  assert.ok(empire.domestic!.requirements!.civilWarVictory);
  assert.equal(empire.domestic!.effects[0].kind, "restoration");
  assert.ok(empire.requires.includes(historicalFocusId(uprising.id)));
  assert.ok(
    empire.excludes?.includes("national-germany-constitutional-opposition"),
  );
});

test("Ülke olay zincirleri döngüsüzdür; önkoşullar ve dışlamalar aynı ülkeye aittir", () => {
  for (const country of atlas.countries) {
    const events = countryEvents(country.id);
    const byId = new Map(events.map((event) => [event.id, event]));
    const visited = new Set<string>();
    function visit(id: string, stack: Set<string>) {
      assert.ok(!stack.has(id), `Döngü: ${id}`);
      if (visited.has(id)) return;
      const event = byId.get(id);
      assert.ok(event, `Eksik önkoşul: ${id}`);
      const next = new Set(stack).add(id);
      for (const prerequisite of event.requires) {
        assert.ok(prerequisite.startsWith("history-"), prerequisite);
        visit(prerequisite.slice(8), next);
      }
      for (const exclusion of event.excludes ?? []) {
        assert.ok(byId.has(exclusion), `${id}: geçersiz dışlama ${exclusion}`);
        assert.notEqual(exclusion, id);
      }
      visited.add(id);
    }
    for (const event of events) visit(event.id, new Set());
  }
});

test("Araştırma programları gerçek teknolojileri ve bilinen teknoloji için açık sonucu kullanır", () => {
  const technologies = new Set(TECHNOLOGIES.map((item) => item.id));
  for (const event of allCountryEvents()) {
    for (const effect of event.domestic?.effects ?? []) {
      if (effect.kind !== "research") continue;
      assert.ok(technologies.has(effect.technology), event.id);
      assert.ok(effect.progress > 0);
      assert.equal(effect.ifKnown, 0.01, event.id);
      assert.ok(
        event.effectText.includes("teknoloji zaten tamamlandıysa"),
        event.id,
      );
    }
    for (const tech of event.domestic?.requirements?.tech ?? [])
      assert.ok(technologies.has(tech), `${event.id}: ${tech}`);
  }
});

test("Denize kapalı ülkelerin 100 temel olayında imkânsız liman tesisi bulunmaz", () => {
  for (const country of atlas.countries) {
    const coast = atlas.provinces.some(
      (p) => p.country === country.id && p.port,
    );
    const events = countryEvents(country.id).filter(
      (event) => event.era === "policy",
    );
    const portEffects = events
      .flatMap((event) => event.domestic!.effects)
      .filter(
        (effect) => effect.kind === "building" && effect.location === "port",
      );
    assert.equal(portEffects.length > 0, coast, country.id);
    assert.equal(
      events.filter(
        (event) => event.branch === (coast ? "Denizcilik" : "İç Bölge Ulaşımı"),
      ).length,
      10,
    );
  }
});

test("Küçük ülkelerde sahte isyan yerine açıkça barışçıl siyasi geçiş bulunur", () => {
  for (const country of atlas.countries.filter((c) => c.id !== "germany")) {
    const count = atlas.provinces.filter(
      (p) => p.country === country.id,
    ).length;
    const alternates = countryEvents(country.id).filter(
      (event) => event.era === "alternative",
    );
    assert.equal(alternates.length, 10, country.id);
    const uprisings = alternates
      .flatMap((event) => event.domestic!.effects)
      .filter((effect) => effect.kind === "uprising");
    assert.equal(uprisings.length, count >= 3 ? 2 : 0, country.id);
    if (count < 3)
      assert.ok(alternates.some((event) => event.title.includes("Barışçıl")));
  }
});

test("Özgün 16 tarihî olay korunur; politika ve alternatifler gerçek tarih iddiası taşımaz", () => {
  assert.equal(HISTORICAL_EVENTS.length, 16);
  assert.ok(
    HISTORICAL_EVENTS.every(
      (event) => event.era === "historical" && event.countrySpecific,
    ),
  );
  for (const event of allCountryEvents().filter(
    (item) => item.kind === "domestic",
  )) {
    assert.match(event.description, /oyun|oyuncu|senaryo/, event.id);
    assert.notEqual(event.era, "historical");
  }
});

test("Katalog ve odak ağacı ülke bazında önbelleklidir; bilinmeyen ülke olay üretemez", () => {
  assert.strictEqual(countryEvents("germany"), countryEvents("germany"));
  assert.strictEqual(allCountryEvents(), allCountryEvents());
  assert.strictEqual(focusTree("germany"), focusTree("germany"));
  for (const country of atlas.countries) {
    const focusIds = new Set(focusTree(country.id).map((focus) => focus.id));
    for (const event of countryEvents(country.id)) {
      assert.strictEqual(historicalEvent(event.id), event);
      assert.ok(focusIds.has(historicalFocusId(event.id)), event.id);
    }
  }
  assert.deepEqual(countryEvents("unknown-state"), []);
  assert.deepEqual(countryEvents("germany-rebels"), []);
  assert.equal(historicalEvent("national-germany-rebels-workshops"), undefined);
  assert.equal(historicalEvent("national-unknown-workshops"), undefined);
});
