import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURES, WORK_ORDERS, CAREER_STORAGE_KEY, isWithinTolerance,
  expectedDisposition, canSeat, assessInspection, readCareer,
  completeWorkOrder, careerRank, normalizeCareer
} from "../src/career/inspection.js";

function storage() {
  const memory = new Map();
  return {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
}

test("drawing limits are inclusive and the one bad web must be rejected", () => {
  assert.equal(isWithinTolerance(FEATURES[0], 200.5), true);
  assert.equal(isWithinTolerance(FEATURES[0], 199.5), true);
  assert.equal(isWithinTolerance(FEATURES[0], 200.51), false);
  assert.equal(isWithinTolerance(FEATURES[2], 8.32), false);
  assert.equal(expectedDisposition(), "REJECT");
});

test("measurement cannot be captured before zeroing and jaw contact", () => {
  const web = FEATURES.find(item => item.id === "web");
  assert.equal(canSeat(web, "caliper", true, 8.3), false);
  assert.equal(canSeat(web, "micrometer", false, 8.3), false);
  assert.equal(canSeat(web, "micrometer", true, 0), false);
  assert.equal(canSeat(web, "micrometer", true, 8.0), true);
  assert.equal(canSeat(FEATURES[0], "caliper", true, 196), true);
});

test("assessment requires correct instrument records and a justified disposition", () => {
  const good = { height: "200.18", flange: "119.76", web: "8.32" };
  assert.equal(assessInspection(good, "REJECT").pass, true);
  assert.equal(assessInspection(good, "ACCEPT").pass, false);
  assert.ok(assessInspection(good, "ACCEPT").errors.disposition);
  assert.ok(assessInspection({ ...good, web: "8.00" }, "REJECT").errors.web);
  assert.ok(assessInspection({ height: "", flange: "119.76", web: "8.32" }, "REJECT").errors.height);
  assert.equal(assessInspection(good, "").pass, false);
});

test("career progress persists and work orders cannot be farmed for XP", () => {
  const store = storage();
  assert.deepEqual(readCareer(store).completed, []);
  const first = completeWorkOrder(store, "WO-001");
  assert.equal(first.newlyCompleted, true);
  assert.equal(first.progress.xp, 100);
  assert.equal(completeWorkOrder(store, "WO-001").newlyCompleted, false);
  assert.equal(readCareer(store).xp, 100);
  const second = completeWorkOrder(store, "WO-002");
  assert.equal(second.progress.xp, 250);
  assert.equal(careerRank(second.progress), "Junior Technician");
  assert.deepEqual(readCareer(store).completed, WORK_ORDERS.map(order => order.id));
  assert.ok(store.getItem(CAREER_STORAGE_KEY));
});

test("tampered, stale and unavailable storage safely normalize", () => {
  const store = storage();
  store.setItem(CAREER_STORAGE_KEY, "{bad json");
  assert.equal(readCareer(store).xp, 0);
  assert.equal(normalizeCareer({ version: 10, completed: ["WO-001"] }).xp, 0);
  assert.equal(normalizeCareer({ version: 1, completed: ["fake", "WO-001", "WO-001"], xp: 999 }).xp, 100);
  assert.equal(completeWorkOrder({ getItem: () => null, setItem: () => { throw Error("blocked"); } }, "WO-001").progress.xp, 100);
  assert.throws(() => completeWorkOrder(store, "fake"), RangeError);
});
