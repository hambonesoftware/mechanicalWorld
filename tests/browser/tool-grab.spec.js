import { test, expect } from "@playwright/test";

async function enterLab(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/career.html?debug=1");
  await page.locator("#goBench").click();
  await expect(page.locator("#toolGrab")).toBeVisible();
  return errors;
}

async function choose(page, mode) {
  await page.locator("#openHandling").click();
  await page.locator('[data-tool-mode="' + mode + '"]').click();
  await expect(page.locator('[data-tool-mode="' + mode + '"]')).toHaveAttribute("aria-pressed","true");
  await page.locator("#handlingDone").click();
}

async function dragBody(page, fraction, pointerId = 60) {
  const grip = page.locator("#toolGrab");
  const rect = await grip.boundingBox();
  const canvas = await page.locator("#workbench3d").boundingBox();
  const travel = Math.max(125,Math.min(230,canvas.width*0.64))*fraction;
  const x = rect.x + rect.width/2, y = rect.y + rect.height/2;
  await grip.dispatchEvent("pointerdown",{pointerId,pointerType:"touch",clientX:x,clientY:y});
  await grip.dispatchEvent("pointermove",{pointerId,pointerType:"touch",clientX:x-travel,clientY:y});
  await grip.dispatchEvent("pointerup",{pointerId,pointerType:"touch",clientX:x-travel,clientY:y});
}

test("assisted mode is the default and magnetically aligns the real 3D instrument",async({page},info)=>{
  test.skip(info.project.name!=="iphone-portrait","Phone touch control acceptance");
  const errors = await enterLab(page);
  await expect(page.locator("#handlingModeLabel")).toHaveText("B");
  await expect(page.locator("#jawGrip")).toBeHidden();
  await page.locator("#pickupTool").click();
  const resting = await page.evaluate(()=>window.redlineCareerDebug());
  expect(resting.held).toBe(true);
  expect(resting.positioned).toBe(false);
  await page.locator("#zeroTool").click();
  await dragBody(page,0.75);
  const seated=await page.evaluate(()=>window.redlineCareerDebug());
  expect(seated.positioned).toBe(true);
  expect(seated.placement).toBe(1);
  expect(seated.toolPosition).not.toEqual(resting.toolPosition);
  await expect(page.locator("#jawGrip")).toBeVisible();
  await expect(page.locator("#toolGrab")).toBeHidden();
  await page.screenshot({path:"test-results/iphone-grab-assisted-seated.png"});
  expect(errors).toEqual([]);
});

test("free grab requires placing the tool much closer before the jaws can engage",async({page},info)=>{
  test.skip(info.project.name!=="iphone-portrait","Phone mode comparison");
  const errors = await enterLab(page);
  await choose(page,"free");
  await expect(page.locator("#handlingModeLabel")).toHaveText("A");
  await page.locator("#pickupTool").click();
  await page.locator("#zeroTool").click();
  await dragBody(page,0.70,62);
  let pose=await page.evaluate(()=>window.redlineCareerDebug());
  expect(pose.positioned).toBe(false);
  expect(pose.placement).toBeGreaterThan(0.60);
  await expect(page.locator("#jawGrip")).toBeHidden();
  await dragBody(page,0.28,63);
  pose=await page.evaluate(()=>window.redlineCareerDebug());
  expect(pose.positioned).toBe(true);
  await expect(page.locator("#jawGrip")).toBeVisible();
  expect(errors).toEqual([]);
});

test("close-up mode brings camera toward the tool and preserves preference",async({page},info)=>{
  test.skip(info.project.name!=="iphone-portrait","Phone closeup controls");
  const errors = await enterLab(page);
  const original=await page.evaluate(()=>window.redlineCareerDebug());
  await choose(page,"closeup");
  await expect(page.locator("#handlingModeLabel")).toHaveText("C");
  await page.locator("#pickupTool").click();
  const close=await page.evaluate(()=>window.redlineCareerDebug());
  expect(close.radius).toBeLessThan(original.radius);
  expect(close.mode).toBe("closeup");
  await page.locator("#zeroTool").click();
  await dragBody(page,0.83,64);
  await expect(page.locator("#jawGrip")).toBeVisible();
  await page.reload();
  await page.locator("#goBench").click();
  await expect(page.locator("#handlingModeLabel")).toHaveText("C");
  expect(errors).toEqual([]);
});
