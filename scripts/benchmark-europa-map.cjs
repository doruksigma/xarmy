// Run against a production server with no other browser benchmarks running.
// Two animation frames per keyboard pan; timings are not an FPS estimate.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.EUROPA_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(
    `${process.env.EUROPA_BASE_URL || "http://localhost:3000"}/games/europa-war`,
  );
  await p.getByRole("button", { name: "SEFERİ BAŞLAT" }).click();
  await p.getByRole("button", { name: "Başkentime git", exact: true }).click();
  const result = await p.evaluate(async () => {
    const svg = document.querySelector("[data-province]").ownerSVGElement;
    const timings = [];
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      svg.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: i % 2 ? "ArrowLeft" : "ArrowRight",
          bubbles: true,
        }),
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    return {
      svgNodes: svg.querySelectorAll("*").length,
      cityLabels: svg
        .querySelector('[data-testid="urban-centers"]')
        .querySelectorAll("text").length,
      panMedianMs: timings[30],
      panP95Ms: timings[57],
      viewBox: svg.getAttribute("viewBox"),
    };
  });
  console.log(JSON.stringify(result));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
