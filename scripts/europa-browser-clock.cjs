const assert = require("node:assert/strict");

/** Advance the real worker through visible clock updates and the public pause
 * button. No private application state is read or changed by this helper. */
async function advanceClockHours(page, hours = 1, speed = 5) {
  assert.ok(Number.isSafeInteger(hours) && hours > 0);
  const before = Number(
    await page.getByTestId("game-date").getAttribute("data-game-hour"),
  );
  assert.ok(Number.isSafeInteger(before));
  const target = before + hours;
  await page
    .getByRole("button", { name: `${speed} kat hız`, exact: true })
    .click();
  await page.evaluate((target) => {
    const clock = document.querySelector('[data-testid="game-date"]');
    window.__europaClockStep = new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const tick = Number(clock.getAttribute("data-game-hour"));
        if (tick < target) return;
        observer.disconnect();
        clearTimeout(timeout);
        document.querySelector('button[aria-label="Zamanı duraklat"]').click();
        resolve(tick);
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Clock did not reach game hour ${target}`));
      }, 60000);
      observer.observe(clock, {
        attributes: true,
        attributeFilter: ["data-game-hour"],
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  }, target);
  await page
    .getByRole("button", { name: "Zamanı başlat", exact: true })
    .click();
  const actual = await page.evaluate(() => window.__europaClockStep);
  await page
    .getByRole("button", { name: "Zamanı başlat", exact: true })
    .waitFor();
  assert.equal(actual, target, "Pause must preserve every requested hour");
  return actual;
}

module.exports = { advanceClockHours };
