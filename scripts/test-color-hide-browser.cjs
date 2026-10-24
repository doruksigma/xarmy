/* Real multiplayer browser checks. Run a production Next server and the separate
   Color Hide WebSocket server first. No simulation, socket, clock or state mocks.
   Playwright must be on NODE_PATH; Chromium defaults to /usr/bin/chromium. */
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const base = process.env.COLOR_HIDE_BASE_URL || "http://localhost:3000";
const output =
  process.env.COLOR_HIDE_ARTIFACT_DIR || "/tmp/xarmy-color-hide-browser";
mkdirSync(output, { recursive: true });
const checks = [];
const clients = [];
const passed = (name, evidence = {}) => {
  checks.push({ name, ...evidence });
  console.log(JSON.stringify({ passed: name, ...evidence }));
};
const waitFor = async (predicate, description, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`Timed out: ${description}`);
};
const me = (client) =>
  client.room?.players.find((p) => p.id === client.room.you);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
// Test-side shoulder-camera geometry aims the visible reticle at the player.
// Only ordinary pointer input changes the game; captures stay server decisions.
function reticleAngles(eye, target, thirdPerson) {
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const unit = (a) => a.map((v) => v / Math.hypot(...a));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const delta = subtract(target, eye);
  let yaw = Math.atan2(-delta[0], -delta[2]);
  let pitch = Math.atan2(delta[1], Math.hypot(delta[0], delta[2]));
  if (!thirdPerson) return { yaw, pitch };
  const error = (y, p) => {
    const f = [
      -Math.sin(y) * Math.cos(p),
      Math.sin(p),
      -Math.cos(y) * Math.cos(p),
    ];
    const camera = [
      eye[0] - f[0] * 3.3 + Math.cos(y) * 0.6,
      eye[1] - f[1] * 3.3 + 0.45,
      eye[2] - f[2] * 3.3 - Math.sin(y) * 0.6,
    ];
    const look = eye.map((v, i) => v + f[i] * 30);
    const direction = unit(subtract(look, camera));
    const right = unit(cross(direction, [0, 1, 0]));
    const up = cross(right, direction);
    const toTarget = subtract(target, camera);
    return [
      dot(toTarget, right) / dot(toTarget, direction),
      dot(toTarget, up) / dot(toTarget, direction),
    ];
  };
  for (let i = 0; i < 12; i++) {
    const e = error(yaw, pitch),
      h = 1e-4;
    if (Math.hypot(...e) < 1e-6) break;
    const ey = error(yaw + h, pitch),
      ep = error(yaw, pitch + h);
    const a = (ey[0] - e[0]) / h,
      b = (ep[0] - e[0]) / h;
    const c = (ey[1] - e[1]) / h,
      d = (ep[1] - e[1]) / h;
    const det = a * d - b * c;
    assert.ok(Math.abs(det) > 1e-8, "camera aiming geometry is solvable");
    yaw -= (d * e[0] - b * e[1]) / det;
    pitch -= (-c * e[0] + a * e[1]) / det;
  }
  return { yaw: normalizeAngle(yaw), pitch };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.COLOR_HIDE_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  async function openClient(name, mobile = false) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 960, height: 600 },
      ...(mobile
        ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
        : {}),
    });
    const page = await context.newPage();
    const client = {
      name,
      mobile,
      context,
      page,
      room: null,
      frames: [],
      errors: [],
      pageErrors: [],
      sent: [],
    };
    clients.push(client);
    page.on("pageerror", (error) => client.pageErrors.push(error.message));
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        try {
          const message = JSON.parse(payload.toString());
          // Never record resume credentials or token-bearing welcome frames.
          if (message.type !== "resume") client.sent.push(message);
        } catch {}
      });
      socket.on("framereceived", ({ payload }) => {
        try {
          const message = JSON.parse(payload.toString());
          if (message.type === "snapshot") {
            client.room = message.room;
            client.frames.push(message.room);
            if (client.frames.length > 1200) client.frames.shift();
          } else if (message.type === "error") client.errors.push(message);
        } catch {}
      });
    });
    await page.goto(`${base}/games/color-hide`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByLabel("Oyuncu adı", { exact: true }).fill(name);
    return client;
  }
  async function create(client) {
    client.room = null;
    await client.page.getByRole("button", { name: /Oda oluştur/ }).click();
    await waitFor(() => client.room?.phase === "lobby", "created room");
    return client.room.code;
  }
  async function join(client, code) {
    client.room = null;
    await client.page.getByLabel("Oda kodu", { exact: true }).fill(code);
    await client.page
      .getByRole("button", { name: "Katıl →", exact: true })
      .click();
    await waitFor(() => client.room?.code === code, `${client.name} joined`);
  }
  async function screenshot(client, name, timeout = 20000) {
    await client.page.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: false,
      timeout,
    });
  }
  async function ready(client) {
    if (!me(client).ready)
      await client.page
        .getByRole("button", { name: "Hazırım", exact: true })
        .click();
    await waitFor(() => me(client)?.ready, `${client.name} ready`);
  }
  async function start(host, members, mapName, mapId) {
    for (const member of members) {
      await member.page
        .getByRole("button", { name: new RegExp(`^${mapName}`) })
        .click();
      await ready(member);
    }
    await waitFor(
      () => host.room.players.every((p) => p.ready && p.vote === mapId),
      "ready and votes propagated",
    );
    await host.page
      .getByRole("button", { name: "Zarı at ve başlat", exact: true })
      .click();
    await waitFor(() => host.room.phase === "drawing", "authoritative draw");
    assert.equal(host.room.map, mapId);
    await waitFor(
      () => members.every((m) => m.room.phase === "hiding"),
      "hiding begins",
      15000,
    );
    // Five SwiftShader renderers share one virtual CPU/GPU in this test. Use
    // the shipped quality control, without mocking render, physics or clocks.
    for (const member of members) {
      const quality = member.page.getByRole("button", {
        name: "Grafik kalitesini değiştir",
        exact: true,
      });
      if ((await quality.textContent()).includes("Detaylı"))
        await quality.click();
    }
  }
  async function leave(client) {
    const direct = client.page.getByRole("button", {
      name: "Odadan ayrıl",
      exact: true,
    });
    if (!(await direct.isVisible().catch(() => false)))
      await client.page
        .getByRole("button", { name: "Çık", exact: true })
        .click();
    await direct.click();
    await client.page.getByLabel("Oyuncu adı", { exact: true }).waitFor();
    client.room = null;
  }
  async function aim(client, position) {
    await client.page.bringToFront();
    await releaseMouse(client);
    const player = me(client);
    const eye = player.position.y + (player.crouching ? 0.82 : 1.42);
    const thirdPerson = (
      await client.page
        .getByRole("button", { name: "Kamerayı değiştir", exact: true })
        .textContent()
    ).includes("3.");
    const { yaw, pitch } = reticleAngles(
      [player.position.x, eye, player.position.z],
      [position.x, position.y + 0.9, position.z],
      thirdPerson,
    );
    const canvas = client.page.getByLabel("Color Hide 3D oyun alanı", {
      exact: true,
    });
    const box = await canvas.boundingBox();
    assert.ok(box, "3D canvas is mounted");
    // Right-button dragging uses the same camera input as ordinary browser play.
    const startX = box.x + box.width / 2,
      startY = box.y + box.height / 2;
    const maxDelta = Math.min(0.45, box.width * 0.0008);
    for (let turn = 0; turn < 25; turn++) {
      const current = me(client);
      const dyaw = Math.max(
        -maxDelta,
        Math.min(maxDelta, normalizeAngle(yaw - current.yaw)),
      );
      const dpitch = Math.max(-0.25, Math.min(0.25, pitch - current.pitch));
      if (
        Math.abs(normalizeAngle(yaw - current.yaw)) < 0.02 &&
        Math.abs(pitch - current.pitch) < 0.02
      )
        return;
      await client.page.mouse.move(startX, startY);
      await client.page.mouse.down({ button: "right" });
      await client.page.mouse.move(
        startX - dyaw / 0.0025,
        startY - dpitch / 0.0025,
        { steps: 4 },
      );
      await client.page.mouse.up({ button: "right" });
      await waitFor(
        () =>
          Math.abs(normalizeAngle(me(client).yaw - current.yaw - dyaw)) <
            0.04 && Math.abs(me(client).pitch - current.pitch - dpitch) < 0.04,
        "camera drag reached authoritative server",
      );
    }
    throw new Error("Could not aim camera using ordinary drag controls");
  }
  async function releaseMouse(client) {
    // Native browser API, equivalent to the game's exit-camera control. CDP's
    // synthetic Escape is not guaranteed to run Chrome's trusted-key default.
    await client.page.evaluate(() => document.exitPointerLock?.());
    await waitFor(
      () => client.page.evaluate(() => !document.pointerLockElement),
      "native pointer lock released",
    );
  }
  async function fire(client) {
    const button = client.page.getByRole("button", {
      name: "Ateş et",
      exact: true,
    });
    if (await button.isVisible()) {
      if (client.mobile) await button.tap();
      else await button.click();
    } else {
      const canvas = client.page.getByLabel("Color Hide 3D oyun alanı", {
        exact: true,
      });
      await canvas.click();
      await waitFor(
        () => client.page.evaluate(() => Boolean(document.pointerLockElement)),
        "canvas pointer lock",
      );
      await client.page.mouse.down();
      await client.page.mouse.up();
    }
  }
  try {
    const alice = await openClient(
      "Ada",
      process.env.COLOR_HIDE_RESUME_ONLY === "1",
    );
    await screenshot(alice, "entry-desktop");
    const code = await create(alice);
    const bob = await openClient(
      "Bora",
      process.env.COLOR_HIDE_RESUME_ONLY === "1",
    );
    if (process.env.COLOR_HIDE_END_ONLY === "1") {
      await join(bob, code);
      await start(alice, [alice, bob], "Orman", "forest");
      const hider = [alice, bob].find((client) => me(client).team === "hider");
      await hider.page
        .getByLabel("Color Hide 3D oyun alanı", { exact: true })
        .click();
      await waitFor(
        () => hider.page.evaluate(() => Boolean(document.pointerLockElement)),
        "real pointer lock while hiding",
      );
      await hider.page.mouse.down({ button: "right" });
      await hider.page.mouse.up({ button: "right" });
      await hider.page.waitForTimeout(150);
      assert.deepEqual(
        hider.pageErrors,
        [],
        "right button under pointer lock must not call invalid setPointerCapture",
      );
      await releaseMouse(hider);
      passed(
        "right click while pointer-locked does not throw or break camera controls",
      );
      await waitFor(
        () => [alice, bob].every((client) => client.room.phase === "seeking"),
        "real hide period ends before desktop capture",
        75000,
      );
      const hunter = [alice, bob].find(
        (client) => me(client).team === "seeker",
      );
      await aim(hunter, me(hider).position);
      await screenshot(hunter, "desktop-reticle-before-victory");
      await fire(hunter);
      await waitFor(
        () =>
          [alice, bob].every(
            (client) =>
              client.room.phase === "finished" &&
              client.room.winner === "seeker",
          ),
        "desktop shot finishes round for both participants",
      );
      await waitFor(
        () => hunter.page.evaluate(() => document.pointerLockElement === null),
        "victory automatically frees mouse for result buttons",
      );
      assert.equal(me(hunter).captures, 1);
      assert.equal(me(hider).ammo, 6);
      assert.deepEqual(hunter.room.survivors, []);
      await screenshot(hunter, "desktop-victory-unlocked");
      const host = [alice, bob].find(
        (client) => client.room.hostId === client.room.you,
      );
      await host.page
        .getByRole("button", { name: "TEKRAR OYNA", exact: true })
        .click();
      await waitFor(
        () =>
          [alice, bob].every(
            (client) =>
              client.room.phase === "lobby" &&
              client.room.players.every((p) => !p.ready),
          ),
        "rematch button works without manual Escape",
      );
      passed(
        "desktop final capture awards victory, frees pointer lock and enables rematch without Escape",
      );
      for (const [mapId, mapName] of [
        ["city", "Şehir"],
        ["school", "Okul"],
      ]) {
        if (mapId === "school") {
          const nextCode = await create(alice);
          await join(bob, nextCode);
        }
        await start(host, [alice, bob], mapName, mapId);
        const visible = [alice, bob].find(
          (client) => me(client).team === "hider",
        );
        await visible.page
          .getByLabel("Color Hide 3D oyun alanı", { exact: true })
          .waitFor();
        await screenshot(visible, `${mapId}-desktop`);
        assert.equal(visible.room.map, mapId);
        await leave(bob);
        await waitFor(
          () =>
            alice.room.players.length === 1 && alice.room.phase === "finished",
          "remaining participant receives ended-round screen",
        );
        await leave(alice);
        passed(
          `${mapName} vote starts the real map; departures and room cleanup remain usable`,
        );
      }
      assert.deepEqual(
        clients.flatMap((client) => client.pageErrors),
        [],
      );
      passed(
        "zero runtime errors in pointer-lock, victory, rematch, city and school checks",
      );
      writeFileSync(
        path.join(output, "report.json"),
        JSON.stringify(
          { base, checks, pageErrors: [], testedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
      return;
    }
    if (process.env.COLOR_HIDE_RESUME_ONLY === "1") {
      await join(bob, code);
      await start(alice, [alice, bob], "Orman", "forest");
      const hider = [alice, bob].find((client) => me(client).team === "hider");
      await hider.page
        .getByLabel("Color Hide 3D oyun alanı", { exact: true })
        .focus();
      await hider.page.keyboard.press("c");
      await waitFor(() => me(hider).crouching, "hider crouches before reload");
      const original = me(hider).position;
      await aim(hider, { x: original.x + 8, y: 0, z: original.z - 12 });
      const id = hider.room.you,
        yaw = me(hider).yaw,
        pitch = me(hider).pitch;
      const sentAt = hider.sent.length;
      hider.room = null;
      await hider.page.reload({ waitUntil: "domcontentloaded" });
      await waitFor(
        () => hider.room?.you === id && me(hider)?.connected,
        "mid-round authenticated resume",
      );
      await hider.page
        .getByLabel("Color Hide 3D oyun alanı", { exact: true })
        .waitFor();
      await hider.page.waitForTimeout(1100);
      const inputs = hider.sent
        .slice(sentAt)
        .filter((message) => message.type === "input");
      assert.ok(inputs.length >= 3, "resumed scene sends normal input frames");
      assert.ok(
        inputs.every(
          ({ input }) =>
            Math.abs(normalizeAngle(input.yaw - yaw)) < 0.025 &&
            Math.abs(input.pitch - pitch) < 0.025 &&
            input.crouch,
        ),
        "first resumed inputs preserve camera yaw, pitch and crouch before asynchronous scene import",
      );
      const before = { ...me(hider).position };
      await hider.page
        .getByLabel("Color Hide 3D oyun alanı", { exact: true })
        .focus();
      await hider.page.keyboard.down("w");
      await hider.page.waitForTimeout(350);
      await hider.page.keyboard.up("w");
      await waitFor(
        () => distance(before, me(hider).position) > 0.4,
        "resumed W movement advances",
      );
      const after = me(hider).position;
      const movementYaw = Math.atan2(
        -(after.x - before.x),
        -(after.z - before.z),
      );
      assert.ok(
        Math.abs(normalizeAngle(movementYaw - yaw)) < 0.1,
        "resumed movement follows restored view direction",
      );
      await screenshot(hider, "mid-round-resume");
      passed(
        "mid-round reload preserves first input orientation and W movement follows restored camera",
      );
      await waitFor(
        () => [alice, bob].every((client) => client.room.phase === "seeking"),
        "resumed mobile round reaches real search",
        75000,
      );
      const hunter = [alice, bob].find(
        (client) => me(client).team === "seeker",
      );
      await aim(hunter, me(hider).position);
      await screenshot(hunter, "mobile-reticle-before-capture");
      await fire(hunter);
      await waitFor(
        () =>
          [alice, bob].every(
            (client) =>
              client.room.phase === "finished" &&
              client.room.winner === "seeker",
          ),
        "real mobile fire captures final hider",
      );
      assert.ok(
        hunter.sent.some((message) => message.type === "shoot" && message.aim),
        "mobile fire uses camera-reticle convergence",
      );
      await screenshot(hunter, "mobile-victory");
      passed(
        "real touch fire uses camera reticle and captures the last hider after mid-round resume",
      );
      assert.deepEqual(
        clients.flatMap((client) => client.pageErrors),
        [],
      );
      writeFileSync(
        path.join(output, "report.json"),
        JSON.stringify(
          { base, checks, pageErrors: [], testedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
      return;
    }
    const cem = await openClient("Cem");
    const deniz = await openClient("Deniz");
    const ece = await openClient("Ece", true);
    const members = [alice, bob, cem, deniz, ece];
    for (const member of members.slice(1)) await join(member, code);
    await waitFor(
      () => members.every((member) => member.room.players.length === 5),
      "five independent connected participants",
    );
    assert.equal(new Set(members.map((m) => m.room.you)).size, 5);
    assert.ok(members.every((m) => m.room.players.every((p) => p.connected)));
    assert.equal(
      await bob.page
        .getByRole("button", { name: "Zarı at ve başlat", exact: true })
        .count(),
      0,
    );
    await cem.page
      .getByLabel("Karakter seç", { exact: true })
      .selectOption("robot");
    await ece.page
      .getByLabel("Karakter seç", { exact: true })
      .selectOption("fox");
    await waitFor(
      () =>
        alice.room.players.find((p) => p.id === cem.room.you)?.character ===
          "robot" &&
        alice.room.players.find((p) => p.id === ece.room.you)?.character ===
          "fox",
      "character choices synchronized",
    );
    await screenshot(alice, "lobby-desktop");
    await screenshot(ece, "lobby-mobile");
    passed("five isolated browser sessions share one authoritative room");

    const extra = await openClient("Fazla");
    await extra.page.getByLabel("Oda kodu", { exact: true }).fill(code);
    await extra.page
      .getByRole("button", { name: "Katıl →", exact: true })
      .click();
    await waitFor(() => extra.errors.length > 0, "sixth member refused");
    assert.equal(alice.room.players.length, 5);
    assert.equal(extra.room, null);
    await extra.context.close();
    passed("sixth player cannot enter a full five-person room");

    const reconnectId = bob.room.you;
    bob.room = null;
    await bob.page.reload({ waitUntil: "domcontentloaded" });
    await waitFor(
      () => bob.room?.you === reconnectId && me(bob)?.connected,
      "same player resumes after refresh",
    );
    await waitFor(
      () =>
        alice.room.players.length === 5 &&
        alice.room.players.find((p) => p.id === reconnectId)?.connected,
      "resume does not duplicate players",
    );
    passed(
      "refresh resumes the authenticated player without duplicate participants",
    );

    await start(alice, members, "Orman", "forest");
    const seeker = members.find((m) => me(m).team === "seeker");
    const hiders = members.filter((m) => me(m).team === "hider");
    assert.ok(seeker && hiders.length === 4);
    await seeker.page
      .getByText("SAKLANMALARINI BEKLE", { exact: true })
      .waitFor();
    await screenshot(seeker, "seeker-blackout");
    const visibleHider = hiders.find((m) => !m.mobile) || hiders[0];
    await screenshot(visibleHider, "forest-hiding-desktop");
    const initialHide = seeker.frames.find(
      (frame) => frame.phase === "hiding" && frame.round === seeker.room.round,
    );
    const hideEnd = initialHide.phaseEndsAt;
    assert.ok(
      hideEnd - initialHide.serverTime >= 59000 &&
        hideEnd - initialHide.serverTime <= 60000,
      "hide timer is actually sixty seconds",
    );
    assert.ok(
      me(seeker).position === null,
      "seeker cannot read a playable hidden location",
    );
    assert.ok(
      seeker.room.players
        .filter((p) => p.id !== seeker.room.you)
        .every((p) => p.position === null),
    );
    passed(
      "equal-player draw selects one seeker; hiding begins with server-side position redaction",
    );

    // Use real keyboard movement and compare the same player on another socket.
    await visibleHider.page.bringToFront();
    await visibleHider.page
      .getByLabel("Color Hide 3D oyun alanı", { exact: true })
      .focus();
    const beforeMove = { ...me(visibleHider).position };
    await visibleHider.page.keyboard.down("w");
    await visibleHider.page.waitForTimeout(650);
    await visibleHider.page.keyboard.up("w");
    await waitFor(
      () => distance(beforeMove, me(visibleHider).position) > 0.5,
      "W movement reaches authoritative room",
    );
    const witness = hiders.find((h) => h !== visibleHider);
    await waitFor(() => {
      const observed = witness.room.players.find(
        (p) => p.id === visibleHider.room.you,
      );
      return (
        observed.position &&
        distance(observed.position, me(visibleHider).position) < 0.15
      );
    }, "movement synchronized to another browser");
    passed(
      "real keyboard movement is simulated by server and synchronized to another player",
    );

    // Color controls are standard UI input events; positions/snapshots stay read-only.
    await visibleHider.page
      .getByRole("button", { name: "◐ Boyan", exact: true })
      .click();
    await visibleHider.page
      .getByRole("button", { name: "Gövde", exact: true })
      .click();
    const previousHead = me(visibleHider).paint.head;
    const previousLegs = me(visibleHider).paint.legs;
    const bodyColor = visibleHider.page.getByLabel("Özel boya rengi", {
      exact: true,
    });
    await bodyColor.fill("#3b6b40");
    await waitFor(
      () => me(visibleHider).paint.body === "#3b6b40",
      "body paint reaches server",
    );
    await waitFor(
      () =>
        witness.room.players.find((p) => p.id === visibleHider.room.you).paint
          .body === "#3b6b40",
      "paint visible in another browser",
    );
    assert.equal(me(visibleHider).paint.head, previousHead);
    assert.equal(me(visibleHider).paint.legs, previousLegs);
    await visibleHider.page
      .getByRole("button", { name: "Boyama menüsünü kapat", exact: true })
      .click();
    passed(
      "separate body paint synchronizes between real participants without replacing head or legs",
    );

    await waitFor(
      () => members.every((m) => m.room.phase === "seeking"),
      "actual sixty-second hiding period expires",
      75000,
    );
    assert.ok(
      members.every((m) => m.room.phaseEndsAt - m.room.serverTime > 590000),
      "search has ten server-controlled minutes",
    );
    for (const frame of seeker.frames.filter((f) => f.phase === "hiding")) {
      assert.ok(
        frame.players.every((p) => p.position === null),
        "hidden locations never leaked in seeker's snapshots",
      );
      assert.ok(
        frame.events.every((event) => !event.position && !event.direction),
        "hidden position never leaked through events",
      );
    }
    await screenshot(
      seeker,
      seeker.mobile ? "forest-search-mobile" : "forest-search-desktop",
    );
    await screenshot(ece, "forest-mobile");
    passed(
      "full real-time hiding window releases seeker into ten-minute search without leaked hide snapshots",
    );

    await ece.page.bringToFront();
    const mobileBefore = { ...me(ece).position };
    const mobileForward = await ece.page
      .getByRole("button", { name: "İleri hareket", exact: true })
      .boundingBox();
    assert.ok(mobileForward, "mobile directional pad is visible");
    const cdp = await ece.context.newCDPSession(ece.page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: mobileForward.x + mobileForward.width / 2,
          y: mobileForward.y + mobileForward.height / 2,
        },
      ],
    });
    await ece.page.waitForTimeout(450);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await waitFor(
      () => distance(mobileBefore, me(ece).position) > 0.4,
      "touch movement reaches server",
    );
    await ece.page.getByRole("button", { name: "Eğil", exact: true }).tap();
    await waitFor(() => me(ece).crouching, "mobile crouch reaches server");
    await ece.page.getByRole("button", { name: "Eğil", exact: true }).tap();
    await waitFor(() => !me(ece).crouching, "mobile stand reaches server");
    const jumpAt = ece.room.serverTime;
    const jumpSeq = me(ece).lastInputSeq;
    const jumpY = me(ece).position.y;
    await ece.page.getByRole("button", { name: "Zıpla", exact: true }).tap();
    await waitFor(
      () =>
        ece.sent.some(
          (message) =>
            message.type === "input" &&
            message.input.seq > jumpSeq &&
            message.input.jump,
        ),
      "touch jump input reaches server",
    );
    await waitFor(
      () =>
        ece.frames.some(
          (frame) =>
            frame.serverTime > jumpAt &&
            frame.players.find((p) => p.id === frame.you)?.position?.y >
              jumpY + 0.1,
        ),
      "server snapshots confirm mobile player became airborne",
    );
    await ece.page
      .getByRole("button", { name: "Kamerayı değiştir", exact: true })
      .tap();
    await screenshot(ece, "forest-mobile-first-person");
    await ece.page
      .getByRole("button", { name: "Kamerayı değiştir", exact: true })
      .tap();
    await cdp.detach();
    passed(
      "real mobile touches move, crouch and jump; first/third-person cameras remain usable",
    );

    // Trigger a real shot through the HUD even when headless pointer lock is unavailable.
    await seeker.page.bringToFront();
    await seeker.page
      .getByLabel("Color Hide 3D oyun alanı", { exact: true })
      .focus();
    await seeker.page.keyboard.down("w");
    await seeker.page.waitForTimeout(900);
    await seeker.page.keyboard.up("w");
    const target = [...hiders].sort(
      (a, b) =>
        distance(me(a).position, me(seeker).position) -
        distance(me(b).position, me(seeker).position),
    )[0];
    await aim(seeker, me(target).position);
    await screenshot(seeker, "reticle-before-capture");
    await fire(seeker);
    await waitFor(
      () =>
        members.every(
          (client) =>
            client.room.players.find((p) => p.id === target.room.you)?.team ===
            "seeker",
        ) && me(seeker).captures === 1,
      "shot converts hider to seeker",
      15000,
    );
    assert.equal(me(target).ammo, 6);
    assert.equal(
      seeker.room.players.find((p) => p.id === target.room.you).team,
      "seeker",
    );
    assert.equal(me(seeker).captures, 1);
    passed(
      "aimed server-validated shot converts a real participant into an armed seeker",
    );

    await releaseMouse(seeker);
    const reloadAt = seeker.room.serverTime;
    const reloadButton = seeker.page.getByRole("button", {
      name: "Şarjör doldur",
      exact: true,
    });
    if (await reloadButton.isVisible()) await reloadButton.click();
    else await seeker.page.keyboard.press("r");
    await waitFor(
      () =>
        seeker.frames.some(
          (frame) =>
            frame.serverTime > reloadAt &&
            frame.players.find((p) => p.id === frame.you)?.reloadEndsAt >
              frame.serverTime,
        ),
      "reload started",
    );
    await waitFor(
      () => me(seeker).ammo === 6 && me(seeker).reloadEndsAt === 0,
      "reload completed",
      7000,
    );
    passed("shot ammunition and timed reload are synchronized by server");

    for (const hiding of hiders.filter((h) => me(h).team === "hider")) {
      await aim(seeker, me(hiding).position);
      await fire(seeker);
      await waitFor(
        () => me(hiding).team === "seeker",
        "remaining hider captured",
      );
      await seeker.page.waitForTimeout(900);
    }
    await waitFor(
      () =>
        members.every(
          (member) =>
            member.room.phase === "finished" && member.room.winner === "seeker",
        ),
      "shared victory after final capture",
    );
    await alice.page
      .getByRole("heading", { name: "EBELER KAZANDI!", exact: true })
      .waitFor();
    await screenshot(alice, "seekers-victory");
    await alice.page
      .getByRole("button", { name: "TEKRAR OYNA", exact: true })
      .click();
    await waitFor(
      () =>
        members.every(
          (member) =>
            member.room.phase === "lobby" &&
            member.room.players.every((p) => !p.ready),
        ),
      "rematch lobby resets readiness",
    );
    passed(
      "all hiders captured: shared victory, round statistics and playable rematch lobby",
    );

    // End this match using ordinary departure, then create two fresh-map rooms.
    for (const member of members.slice(1)) await leave(member);
    await waitFor(
      () => alice.room.players.length === 1,
      "disconnected players removed",
    );
    await leave(alice);
    passed("explicit departures leave no ghost players or stuck room controls");

    for (const [mapId, mapName] of [
      ["city", "Şehir"],
      ["school", "Okul"],
    ]) {
      const roomCode = await create(alice);
      await join(ece, roomCode);
      await start(alice, [alice, ece], mapName, mapId);
      const hider = [alice, ece].find((client) => me(client).team === "hider");
      await screenshot(
        hider,
        `${mapId}-${hider.mobile ? "mobile" : "desktop"}`,
      );
      const canvas = hider.page.getByLabel("Color Hide 3D oyun alanı", {
        exact: true,
      });
      assert.equal(await canvas.count(), 1);
      assert.ok((await canvas.boundingBox()).width > 200);
      await leave(ece);
      await leave(alice);
      passed(
        `${mapName} majority vote loads a playable 3D map in another real round`,
      );
    }

    assert.deepEqual(
      clients.flatMap((client) => client.pageErrors),
      [],
    );
    passed("zero browser runtime errors across desktop and mobile sessions");
    writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        { base, checks, pageErrors: [], testedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
  } catch (error) {
    writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        {
          error: error.stack || String(error),
          checks,
          clients: clients.map((client) => ({
            name: client.name,
            pageErrors: client.pageErrors,
            errors: client.errors,
            room: client.room,
            lastSent: client.sent.slice(-8),
            jumpInputs: client.sent.filter(
              (m) => m.type === "input" && m.input.jump,
            ),
            airborne: client.frames
              .filter(
                (f) => f.players.find((p) => p.id === f.you)?.position?.y > 0.1,
              )
              .map((f) => ({
                at: f.serverTime,
                player: f.players.find((p) => p.id === f.you),
              })),
          })),
        },
        null,
        2,
      ),
    );
    for (const client of clients)
      if (!client.page.isClosed())
        await screenshot(client, `failure-${client.name}`, 8000).catch(
          () => undefined,
        );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
