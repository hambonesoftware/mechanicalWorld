import { test, expect } from "@playwright/test";

async function moveJaw(page, opening) {
  await page.locator("#jawOpening").evaluate((node, value) => {
    node.value = String(value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, opening);
}

async function measureFeature(page, feature, tool, approx) {
  await page.locator('[data-feature="' + feature + '"]').click();
  await page.locator('[data-tool="' + tool + '"]').click();
  // Each measuring tool must be calibrated at closed-jaw zero.
  await moveJaw(page, 0);
  await page.locator("#zeroTool").click();
  await moveJaw(page, approx);
  await page.locator("#seatJaws").click();
  await expect(page.locator("#meterState")).toHaveText("CONTACT ✓");
  await expect(page.locator("#transferReading")).toBeEnabled();
  await page.locator("#transferReading").click();
}

test("career first day is readable across phone and tablet viewports", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/career.html");
  await expect(page.getByText("First day.", { exact: false })).toBeVisible();
  await expect(page.locator("#rankLabel")).toContainText("Engineering Trainee");
  await expect(page.locator("#goBench")).toBeVisible();
  await page.screenshot({ path: "test-results/" + testInfo.project.name + "-career-order.png" });
  await page.locator("#goBench").click();
  await expect(page.locator("#workbench3d")).toBeVisible();
  await expect(page.locator("#jawOpening")).toBeVisible();
  await page.screenshot({ path: "test-results/" + testInfo.project.name + "-career-bench.png" });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("inspection requires calibrated contact, correct tool and an evidence-based rejection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "Representative full career work order on phone.");
  await page.goto("/career.html");
  await page.locator("#goBench").click();

  await page.locator("#seatJaws").click();
  await expect(page.locator("#measureStatus")).toContainText("Set the instrument zero");
  await page.locator("#zeroTool").click();
  await moveJaw(page, 100);
  await page.locator("#seatJaws").click();
  await expect(page.locator("#measureStatus")).toContainText("aren't touching");

  await measureFeature(page, "height", "caliper", 200);
  await expect(page.locator("#record-height")).toHaveValue("200.18");
  await measureFeature(page, "flange", "caliper", 120);
  await expect(page.locator("#record-flange")).toHaveValue("119.76");

  await page.locator('[data-feature="web"]').click();
  await page.locator("#seatJaws").click();
  await expect(page.locator("#measureStatus")).toContainText("Wrong instrument");
  await measureFeature(page, "web", "micrometer", 8);
  await expect(page.locator("#record-web")).toHaveValue("8.32");
  await expect(page.locator("#inspectionForm")).toBeVisible();

  await page.locator('input[name="disposition"][value="ACCEPT"]').check();
  await page.locator("#submitReport").click();
  await expect(page.locator("#error-disposition")).toContainText("One incorrect dimension");

  await page.locator('input[name="disposition"][value="REJECT"]').check();
  await page.locator("#submitReport").click();
  await expect(page.locator("#completionOverlay")).toBeVisible();
  await expect(page.locator("#rewardXP")).toHaveText("+100");
  await expect(page.locator("#xpCount")).toHaveText("100");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("redline-career-v1")));
  expect(stored.completed).toContain("WO-001");

  await page.locator("#completionOverlay a").click();
  await expect(page).toHaveURL(/\?career=1$/);
  await expect(page.locator("#sceneLoading")).toBeHidden({ timeout: 35_000 });
  await page.locator("#modeTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({ timeout: 18_000 });
  await expect(page.locator("#resultTitle")).toHaveText("CHALLENGE PASSED");
  await expect(page.locator("#resultDetail")).toContainText("WO-002");
  await page.locator("#careerReturn").click();
  await expect(page.locator("#rankLabel")).toHaveText("Junior Technician");
  await expect(page.locator("#xpCount")).toHaveText("250");
});
