import assert from "node:assert/strict";
import test from "node:test";
import { createUnitHealthOverlay, formationHealth } from "./map3d-unit-health";
import type { Army } from "./types";

test("3D birlik canı ve organizasyonu bütün gösterilen tümenlerin gerçek ortalamasıdır", () => {
  const armies = [
    { strength: 100, organization: 20 },
    { strength: 40, organization: 80 },
    { strength: 10, organization: 50 },
  ];
  const before = structuredClone(armies);
  assert.deepEqual(formationHealth(armies), {
    strength: 50,
    organization: 50,
    label: "Can %50 · Organizasyon %50",
  });
  armies[0].strength = 70;
  assert.equal(formationHealth(armies).strength, 40);
  armies[0].strength = before[0].strength;
  assert.deepEqual(armies, before);
  assert.deepEqual(formationHealth([]), {
    strength: 0,
    organization: 0,
    label: "Can %0 · Organizasyon %0",
  });
});

test("bozuk veya sınırdaki görsel oranlar negatif veya NaN CSS oluşturmaz", () => {
  assert.deepEqual(
    formationHealth([
      { strength: NaN, organization: -10 },
      { strength: 140, organization: Infinity },
    ]),
    { strength: 50, organization: 0, label: "Can %50 · Organizasyon %0" },
  );
});

test("can göstergesi tek düğümde renk, oran ve erişilebilir açıklamayı taşır", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  let created = 0;
  const fakeDocument = {
    createElement(tag: string) {
      assert.equal(tag, "span");
      created++;
      const properties = new Map<string, string>(),
        attributes = new Map<string, string>();
      return {
        className: "",
        dataset: {} as Record<string, string>,
        textContent: "",
        title: "",
        style: {
          setProperty(name: string, value: string) {
            properties.set(name, value);
          },
          getPropertyValue(name: string) {
            return properties.get(name);
          },
        },
        setAttribute(name: string, value: string) {
          attributes.set(name, value);
        },
        getAttribute(name: string) {
          return attributes.get(name);
        },
      };
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });
  try {
    for (const [strength, color] of [
      [90, "#9bdc89"],
      [45, "#efc76e"],
      [15, "#f18c82"],
    ] as const) {
      const element = createUnitHealthOverlay([
        { strength, organization: 60 } as Army,
      ]);
      assert.equal(element.className, "map3d-unit-health");
      assert.equal(element.dataset.strength, strength.toFixed(2));
      assert.equal(element.dataset.organization, "60.00");
      assert.equal(element.textContent, `CAN %${strength}`);
      assert.equal(
        element.style.getPropertyValue("--unit-strength"),
        `${strength}%`,
      );
      assert.equal(
        element.style.getPropertyValue("--unit-organization"),
        "60%",
      );
      assert.equal(
        element.style.getPropertyValue("--unit-health-color"),
        color,
      );
      assert.equal(
        element.getAttribute("aria-label"),
        `Can %${strength} · Organizasyon %60`,
      );
    }
    assert.equal(created, 3);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
