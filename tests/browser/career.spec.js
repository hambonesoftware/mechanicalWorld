import { test, expect } from "@playwright/test";

async function openWorkstation(page) {
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/career.html?debug=1");
  await expect(page.locator("#workOrderSheet")).toBeVisible();
  await expect(page.locator("#goBench")).toBeVisible();
  await page.locator("#goBench").click();
  await expect(page.locator("#workOrderSheet")).toBeHidden();
  await expect(page.locator("#workbench3d")).toBeVisible();
  await expect(page.locator("#jawGrip")).toBeVisible();
  return errors;
}

async function setJaw(page, opening){
  await page.locator("#jawOpening").evaluate((node,value)=>{
    node.value=String(value);
    node.dispatchEvent(new Event("input",{bubbles:true}));
  },opening);
}

async function measure(page,feature,opening,zero){
  await page.locator('[data-feature="'+feature+'"]').click();
  if(zero)await page.locator("#zeroTool").click();
  await setJaw(page,opening);
  await page.locator("#seatJaws").click();
  await expect(page.locator("#meterState")).toHaveText("CONTACT ✓");
  await page.locator("#transferReading").click();
}

test("career starts with a single short work order and a direct Start Measuring action",async({page},info)=>{
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/career.html");
  await expect(page.locator("#workOrderSheet")).toBeVisible();
  await expect(page.locator("#goBench")).toBeInViewport();
  await expect(page.locator("#rankLabel")).toContainText("Engineering Trainee");
  await page.screenshot({path:"test-results/"+info.project.name+"-career-order.png"});
  await page.locator("#goBench").click();
  await expect(page.locator("#workOrderSheet")).toBeHidden();
  await expect(page.locator(".work-controls")).toBeVisible();
  await expect(page.locator("#zeroTool")).toBeVisible();
  await expect(page.locator("#workbench3d")).toBeVisible();
  await page.screenshot({path:"test-results/"+info.project.name+"-career-bench.png"});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("mobile play area and single primary action remain visible without document scrolling",async({page},info)=>{
  const errors=await openWorkstation(page);
  const viewport=page.viewportSize();
  const scene=await page.locator("#sceneWrap").boundingBox();
  const controls=await page.locator(".work-controls").boundingBox();
  const dock=await page.locator(".bottom-nav").boundingBox();
  expect(scene.width).toBeGreaterThan(viewport.width*0.95);
  expect(scene.height).toBeGreaterThan(viewport.height*0.95);
  expect(controls.width).toBeGreaterThan(0);
  if(info.project.name==="mobile-landscape"){
    // Landscape intentionally uses a slim control strip down the right side;
    // scene ownership is measured by width here, not its panel height.
    expect(controls.width).toBeLessThan(viewport.width*0.46);
  }else{
    expect(controls.height).toBeLessThan(viewport.height*0.52);
  }
  expect(dock.y+dock.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.locator("#fineControls")).toBeHidden();
  await expect(page.locator("#sceneCameraTools")).toBeHidden();
  await page.locator("#cameraToggle").click();
  await expect(page.locator("#zoomIn")).toBeVisible();
  await expect(page.locator("#zoomOut")).toBeVisible();
  await page.locator("#cameraToggle").click();
  await expect(page.locator("#sceneCameraTools")).toBeHidden();
  await page.locator("#fineToggle").click();
  await expect(page.locator("#fineControls")).toBeVisible();
  await page.locator("#fineToggle").click();
  await expect(page.locator("#fineControls")).toBeHidden();
  await expect(page.locator("#openDrawing")).toBeVisible();
  await expect(page.locator("#openReport")).toBeVisible();
  const visibleActions=await page.locator(".action-row button:visible").count();
  expect(visibleActions).toBe(1);
  await page.locator("#openDrawing").click();
  await expect(page.locator("#drawingSheet")).toBeVisible();
  await page.locator("#closeDrawingBottom").click();
  await expect(page.locator("#drawingSheet")).toBeHidden();
  expect(errors).toEqual([]);
});

test("direct caliper dragging produces a real recorded height reading",async({page},info)=>{
  test.skip(info.project.name!=="iphone-portrait","Representative iPhone touch test");
  const errors=await openWorkstation(page);
  const canvas=page.locator("#workbench3d");
  const start=await page.evaluate(()=>window.redlineCareerDebug());
  await page.locator("#cameraToggle").click();
  await page.locator("#zoomIn").click();
  const zoomed=await page.evaluate(()=>window.redlineCareerDebug());
  expect(zoomed.radius).toBeLessThan(start.radius);
  await page.locator("#zoomOut").click();
  const zoomout=await page.evaluate(()=>window.redlineCareerDebug());
  expect(zoomout.radius).toBeGreaterThan(zoomed.radius);
  await page.locator("#panMode").click();
  await expect(page.locator("#panMode")).toHaveAttribute("aria-pressed","true");
  const rect=await canvas.boundingBox();
  const x=rect.x+rect.width*0.5,y=rect.y+rect.height*0.52;
  await canvas.dispatchEvent("pointerdown",{pointerId:21,pointerType:"touch",clientX:x,clientY:y});
  await canvas.dispatchEvent("pointermove",{pointerId:21,pointerType:"touch",clientX:x+30,clientY:y+18});
  await canvas.dispatchEvent("pointerup",{pointerId:21,pointerType:"touch",clientX:x+30,clientY:y+18});
  const moved=await page.evaluate(()=>window.redlineCareerDebug());
  expect(moved.target).not.toEqual(start.target);
  await page.locator("#resetView").click();
  const reset=await page.evaluate(()=>window.redlineCareerDebug());
  expect(reset.target).toEqual(start.target);
  await page.locator("#panMode").click();
  await page.locator("#cameraToggle").click();

  await page.locator("#zeroTool").click();
  await expect(page.locator("#zeroTool")).toBeHidden();
  await expect(page.locator("#seatJaws")).toBeVisible();
  // The in-world help stays visible after zeroing, until the first real
  // interaction with the instrument, rather than disappearing too early.
  await expect(page.locator("#contactGuide")).toBeVisible();

  const grip=page.locator("#jawGrip");
  const gripRect=await grip.boundingBox();
  const canvasRect=await canvas.boundingBox();
  const touchX=gripRect.x+gripRect.width/2;
  expect(touchX).toBeGreaterThan(canvasRect.x+canvasRect.width*0.12);
  expect(gripRect.x+gripRect.width).toBeLessThan(canvasRect.x+canvasRect.width*0.94);
  const hintRect=await page.locator("#contactGuide").boundingBox();
  expect(hintRect.x).toBeGreaterThanOrEqual(canvasRect.x-2);
  expect(hintRect.x+hintRect.width).toBeLessThanOrEqual(canvasRect.x+canvasRect.width+2);
  const gx=gripRect.x+gripRect.width/2;
  const gy=gripRect.y+gripRect.height/2;
  const travel=Math.max(105,Math.min(215,rect.height*0.52));
  const slide=travel*200/250;
  await grip.dispatchEvent("pointerdown",{pointerId:42,pointerType:"touch",clientX:gx,clientY:gy});
  await expect(page.locator("#contactGuide")).toBeHidden();
  await grip.dispatchEvent("pointermove",{pointerId:42,pointerType:"touch",clientX:gx,clientY:gy-slide});
  await grip.dispatchEvent("pointerup",{pointerId:42,pointerType:"touch",clientX:gx,clientY:gy-slide});
  await expect(page.locator("#meterState")).toHaveText("CONTACT ✓");
  await expect(page.locator("#meterReading")).toHaveText("200.18");
  await expect(page.locator("#transferReading")).toBeVisible();
  await page.locator("#transferReading").click();
  await expect(page.locator("#record-height")).toHaveValue("200.18");
  await expect(page.locator("#reportCount")).toHaveText("1/3");
  expect(errors).toEqual([]);
});

test("career work order teaches instruments, checks tolerance and awards XP",async({page},info)=>{
  test.skip(info.project.name!=="iphone-portrait","Representative phone career end-to-end test");
  const errors=await openWorkstation(page);
  await page.locator("#zeroTool").click();
  await setJaw(page,200);
  await page.locator("#seatJaws").click();
  await expect(page.locator("#meterReading")).toHaveText("200.18");
  await page.locator("#transferReading").click();
  await expect(page.locator("#taskTitle")).toContainText("flange");
  await measure(page,"flange",120,false);
  await expect(page.locator("#taskTitle")).toContainText("web");
  await expect(page.locator("#meterName")).toHaveText("MICROMETER");
  await page.locator("#zeroTool").click();
  await setJaw(page,8);
  await page.locator("#seatJaws").click();
  await expect(page.locator("#meterReading")).toHaveText("8.32");
  await page.locator("#transferReading").click();
  await expect(page.locator("#reportSheet")).toBeVisible();
  await expect(page.locator("#reportCount")).toHaveText("3/3");
  await expect(page.locator("#record-height")).toHaveValue("200.18");
  await expect(page.locator("#record-flange")).toHaveValue("119.76");
  await expect(page.locator("#record-web")).toHaveValue("8.32");
  await page.locator('input[name="disposition"][value="ACCEPT"]').check();
  await page.locator("#submitReport").click();
  await expect(page.locator("#error-disposition")).toContainText("One incorrect dimension");
  await page.locator('input[name="disposition"][value="REJECT"]').check();
  await page.locator("#submitReport").click();
  await expect(page.locator("#completionOverlay")).toBeVisible();
  await expect(page.locator("#rewardXP")).toHaveText("+100 XP");
  await expect(page.locator("#xpCount")).toHaveText("100");
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("redline-career-v1")));
  expect(saved.completed).toContain("WO-001");
  expect(errors).toEqual([]);
  await page.locator("#completionOverlay a").click();
  await expect(page).toHaveURL(/\?career=1$/);
  await expect(page.locator("#sceneLoading")).toBeHidden({timeout:35000});
  await page.locator("#modeTest").click();
  await expect(page.locator("#resultCard")).toBeVisible({timeout:18000});
  await expect(page.locator("#resultTitle")).toHaveText("CHALLENGE PASSED");
  await expect(page.locator("#resultDetail")).toContainText("WO-002");
});

test("tablet and landscape layouts keep the lab fullscreen and the controls contextual",async({page},info)=>{
  test.skip(!["mobile-landscape","tablet"].includes(info.project.name),"Wide viewport checks");
  const errors=await openWorkstation(page);
  const viewport=page.viewportSize();
  const scene=await page.locator("#sceneWrap").boundingBox();
  const controls=await page.locator(".work-controls").boundingBox();
  expect(scene.width).toBeGreaterThan(viewport.width*0.95);
  expect(scene.height).toBeGreaterThan(viewport.height*0.95);
  expect(controls.width).toBeLessThan(viewport.width+2);
  await expect(page.locator("#cameraToggle")).toBeVisible();
  await expect(page.locator("#fineControls")).toBeHidden();
  const grip=await page.locator("#jawGrip").boundingBox();
  expect(grip.width).toBeLessThanOrEqual(50);
  expect(grip.height).toBeLessThanOrEqual(50);
  expect(errors).toEqual([]);
});
