import { test, expect } from "@playwright/test";

async function waitForLab(page, route = "/") {
  const startupError = new Promise((_, reject) => {
    page.once("pageerror", error => reject(new Error("Startup error: " + error.message)));
  });
  const loading = async () => {
    await page.goto(route);
    await expect(page.locator("#sceneLoading")).toBeHidden({ timeout: 35_000 });
    await expect(page.locator("#stressMetric")).not.toContainText("—");
  };
  await Promise.race([startupError, loading()]);
}

test("scene remains visible; build, test and inspect work without page scrolling", async ({ page }, testInfo) => {
  await waitForLab(page);

  const screen = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    canvasHeight: document.querySelector("#laboratory").getBoundingClientRect().height,
    viewportHeight: window.visualViewport?.height || window.innerHeight
  }));
  expect(screen.scrollHeight, "The game should not require document scrolling").toBeLessThanOrEqual(screen.innerHeight + 2);
  expect(screen.canvasHeight).toBeGreaterThan(screen.viewportHeight * 0.8);

  await expect(page.locator(".hb-play--workbench")).toBeVisible();
  await expect(page.locator(".hb-play__readout")).toHaveCount(3);
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator("#modeTest")).toBeVisible();
  await expect(page.locator("#buildSheet")).toBeHidden();
  await page.screenshot({ path: "test-results/" + testInfo.project.name + "-ready.png" });

  await page.locator("#modeBuild").click();
  await expect(page.locator("#buildSheet")).toBeVisible();
  await expect(page.locator("#handleLayer")).toBeVisible();
  await expect(page.locator("#laboratory")).toBeVisible();
  await expect(page.locator(".scene-floating-actions")).toBeHidden();
  if (testInfo.project.name.includes("portrait")) {
    await expect(page.locator("#lengthHandle")).toBeVisible();
    await expect(page.locator("#depthHandle")).toBeVisible();
    await expect(page.locator("#loadHandle")).toBeVisible();
  }
  const materialButton = page.locator('[data-material="aluminum"]');
  await materialButton.click();
  await expect(materialButton).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/" + testInfo.project.name + "-build.png" });

  // Restore the default design so the first challenge has a predictable outcome.
  await page.locator('[data-material="steel"]').click();
  await page.locator("#modeTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("#resultTitle")).toContainText("CHALLENGE PASSED");
  await page.screenshot({ path: "test-results/" + testInfo.project.name + "-tested.png" });

  await page.locator("#modeInspect").click();
  await expect(page.locator("#inspectSheet")).toBeVisible();
  await expect(page.locator("#lessonText")).not.toBeEmpty();
  await expect(page.locator("#solverLabel")).toContainText(/FEAScript|Analytical|Fiber elastoplastic/);
});

test("failure is explained, camera controls and challenge selection remain reachable", async ({ page }) => {
  await waitForLab(page);
  await page.locator("#modeBuild").click();
  await page.locator("#depth").evaluate((node) => {
    node.value = "0.08";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#modeTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("#resultTitle")).not.toContainText("CHALLENGE PASSED");
  await page.locator("#editAgain").click();
  await expect(page.locator("#buildSheet")).toBeVisible();
  await page.locator("#closeBuild").click();
  await page.locator("#settingsToggle").click();
  await expect(page.locator("#settingsMenu")).toBeVisible();
  await page.locator("#cameraReset").click();
  await expect(page.locator("#settingsMenu")).toBeHidden();
  await page.locator("#settingsToggle").click();
  await expect(page.locator("#challengeNext")).toBeVisible();
  await page.locator("#challengeNext").click();
  await expect(page.locator("#settingsMenu")).toBeHidden();
  await expect(page.locator("#labChip")).toContainText("LAB 02");
});

test("full commanded overload shows cracking, tearing and a detached specimen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "One complete destructive run validates the shared scene.");
  await waitForLab(page, "/?debug=1");
  await page.evaluate(() => {
    window.redlineFailureAudit = { stages: [], minimumY: Infinity, samples: 0 };
    const game = document.getElementById("game");
    const record = () => {
      const stage = game.dataset.damageStage;
      if (stage && !window.redlineFailureAudit.stages.includes(stage)) {
        window.redlineFailureAudit.stages.push(stage);
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(game, { attributes: true, attributeFilter: ["data-damage-stage"] });
    const sample = () => {
      const status = window.redlineVisualDebug?.();
      if (status && Number.isFinite(status.lowestDisplayedSurface)) {
        window.redlineFailureAudit.minimumY = Math.min(window.redlineFailureAudit.minimumY, status.lowestDisplayedSurface);
        window.redlineFailureAudit.samples += 1;
      }
    };
    window.redlineFailureAudit.stop = () => {
      clearInterval(interval);
      observer.disconnect();
    };
    const interval = setInterval(sample, 40);
    record();
  });
  await page.locator("#modeBuild").click();
  await page.locator("#targetLoadControl").evaluate((node) => {
    node.value = "60";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#targetLoadOutput")).toContainText("60.0");
  await page.locator("#modeTest").click();
  await expect.poll(async () => page.evaluate(() =>
    window.redlineFailureAudit.stages.includes("tearing")
  ), { timeout: 14_000 }).toBe(true);
  await page.screenshot({ path: "test-results/iphone-portrait-during-tear.png" });
  await expect(page.locator("#resultCard")).toBeVisible({ timeout: 18_000 });
  await expect(page.locator("#resultTitle")).toContainText("RUPTURE");
  await expect(page.locator("#canvasForce")).toHaveText("60.0 kN");
  await expect(page.locator("#game")).toHaveAttribute("data-damage-stage", "ruptured");
  await expect(page.locator("#resultDetail")).toContainText("no longer transmits");
  const audit = await page.evaluate(() => {
    window.redlineFailureAudit.stop();
    return {
      stages: window.redlineFailureAudit.stages,
      minimumY: window.redlineFailureAudit.minimumY,
      samples: window.redlineFailureAudit.samples,
      scene: window.redlineVisualDebug?.()
    };
  });
  expect(audit.stages).toEqual(expect.arrayContaining(["yielding", "cracking", "tearing", "ruptured"]));
  expect(audit.samples).toBeGreaterThan(10);
  expect(audit.minimumY).toBeGreaterThan(0.32);
  expect(audit.scene.floorTop).toBeCloseTo(0.28);
  expect(audit.scene.ruptureInitialLowestY).toBeGreaterThan(0.28);
  expect(audit.scene.stationaryAndMovingPieces).toBe(2);
  expect(audit.scene.intactBeamVisible).toBe(false);
  await page.screenshot({ path: "test-results/iphone-portrait-ruptured.png" });
  await page.locator("#editAgain").click();
  await expect(page.locator("#game")).toHaveAttribute("data-damage-stage", "elastic");
});

test("Break It mode surpasses a safe 12 kN command until rupture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "One complete destruction test is sufficient.");
  await waitForLab(page);
  await page.locator("#modeBuild").click();
  await page.locator("#destructiveTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({ timeout: 18_000 });
  await expect(page.locator("#resultTitle")).toContainText("RUPTURE");
  const fullCommand = await page.locator("#canvasForce").innerText();
  expect(parseFloat(fullCommand)).toBeGreaterThan(12);
  await expect(page.locator("#resultDetail")).toContainText("actuator completed");
});

test("Workbench HUD stays contextual during load ramp", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "Run representative phone flow once.");
  await waitForLab(page);
  await expect(page.locator(".hb-play")).toHaveAttribute("data-phase", "ready");
  await expect(page.locator("#modeInspect")).toBeHidden();
  await page.locator("#modeTest").click();
  await expect(page.locator(".hb-play")).toHaveAttribute("data-phase", "playing");
  await expect(page.locator("#modeBuild")).toBeHidden();
  await expect(page.locator("#resultCard")).toBeVisible({timeout:18000});
  await expect(page.locator(".hb-play")).toHaveAttribute("data-phase", "result");
  await expect(page.locator("#modeInspect")).toBeVisible();
});


test("numerical loading, unloading, reloading and curve replay preserve plastic set", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "Run full elastoplastic history once on a phone.");
  await waitForLab(page);
  await page.locator("#modeBuild").click();
  await page.locator("#targetLoadControl").evaluate(node => {
    node.value = "44";
    node.dispatchEvent(new Event("input", { bubbles:true }));
  });
  await page.locator("#modeTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({timeout:18000});
  await expect(page.locator("#resultTitle")).toContainText("PERMANENT DEFORMATION");
  await expect(page.locator("#unloadTest")).toBeVisible();
  await page.locator("#unloadTest").click();
  await expect(page.locator("#resultTitle")).toContainText("UNLOADED",{timeout:18000});
  await expect(page.locator("#resultDetail")).toContainText("permanent tip displacement");
  const remaining = await page.locator("#resultDetail").textContent();
  const mm = /predicts ([0-9.]+) mm/.exec(remaining);
  expect(mm).not.toBeNull();
  expect(Number(mm[1])).toBeGreaterThan(0.01);
  await expect(page.locator("#reloadTest")).toBeVisible();
  await page.locator("#reloadTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({timeout:18000});
  await expect(page.locator("#canvasForce")).toContainText("44.0 kN");
  await page.locator("#openHistory").click();
  await expect(page.locator("#inspectSheet")).toBeVisible();
  await expect(page.locator("#solverLabel")).toContainText("Fiber elastoplastic beam");
  await expect(page.locator("#forceDeflectionCurve polyline").first()).toBeVisible();
  const size = await page.locator("#historyScrubber").getAttribute("max");
  expect(Number(size)).toBeGreaterThan(20);
  await page.locator("#historyScrubber").evaluate(node => {
    node.value = "0";
    node.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect(page.locator("#historyPointLabel")).toContainText("0.0 kN");
  await page.locator("#historyLatest").click();
  await expect(page.locator("#historyPointLabel")).toContainText("44.0 kN");
  await page.screenshot({path:"test-results/iphone-portrait-plastic-history.png"});
});
