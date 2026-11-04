import type { Army } from "./types";

const percentage = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

/** All members contribute equally, matching the formation's displayed count. */
export function formationHealth(
  armies: readonly Pick<Army, "strength" | "organization">[],
) {
  let strength = 0,
    organization = 0;
  for (const army of armies) {
    strength += percentage(army.strength);
    organization += percentage(army.organization);
  }
  const count = armies.length;
  strength = count ? strength / count : 0;
  organization = count ? organization / count : 0;
  return {
    strength,
    organization,
    label: `Can %${Math.round(strength)} · Organizasyon %${Math.round(organization)}`,
  };
}

/** One small DOM node per existing marker, created on state updates, not frames. */
export function createUnitHealthOverlay(armies: readonly Army[]) {
  const health = formationHealth(armies);
  const element = document.createElement("span");
  element.className = "map3d-unit-health";
  element.dataset.strength = health.strength.toFixed(2);
  element.dataset.organization = health.organization.toFixed(2);
  element.style.setProperty("--unit-strength", `${health.strength}%`);
  element.style.setProperty("--unit-organization", `${health.organization}%`);
  element.style.setProperty(
    "--unit-health-color",
    health.strength >= 60
      ? "#9bdc89"
      : health.strength >= 30
        ? "#efc76e"
        : "#f18c82",
  );
  element.textContent = `CAN %${Math.round(health.strength)}`;
  element.setAttribute("aria-label", health.label);
  element.title = health.label;
  return element;
}
