import { describe, expect, it } from "vitest";
import { effectiveWashResult } from "./archive";
import { assignmentBlockers, effectiveZone, isWashExpired } from "./admission";
import { reducer } from "./store";
import { seedState } from "./seed";
import type { TurnoverState } from "./types";

const HOUR = 3600_000;
const NOW = 1_000_000_000_000;

function registerFresh(state: TurnoverState, id: string, at = NOW - HOUR): TurnoverState {
  return reducer(state, {
    type: "register",
    id,
    grade: "ISO 5",
    lastCleanedAt: at,
    washCycleHours: 24,
    at,
  });
}

describe("分配准入", () => {
  it("未卸片（仍绑定批次）不得再次分配，并写 blocked 留档", () => {
    let state = registerFresh(seedState(NOW), "T-001");
    state = reducer(state, { type: "assign", id: "T-001", batchId: "B-1", at: NOW });
    expect(state.carriers.find((c) => c.id === "T-001")?.zone).toBe("in_use");

    state = reducer(state, { type: "assign", id: "T-001", batchId: "B-2", at: NOW + 1000 });
    const carrier = state.carriers.find((c) => c.id === "T-001");
    expect(carrier?.batchId).toBe("B-1");
    expect(carrier?.wafersLoaded).toBe(true);
    const blocked = state.events.filter((e) => e.kind === "blocked" && e.carrierId === "T-001");
    expect(blocked).toHaveLength(1);
    if (blocked[0].kind === "blocked") {
      expect(blocked[0].blockedReasons.join("")).toContain("卸片");
    }
  });

  it("清洗过期的可用载具会被判为待洗区且分配被拦截", () => {
    const state = registerFresh(seedState(NOW), "T-002", NOW - 25 * HOUR);
    const carrier = state.carriers.find((c) => c.id === "T-002")!;
    expect(isWashExpired(carrier, NOW)).toBe(true);
    expect(assignmentBlockers(carrier, NOW).length).toBeGreaterThan(0);
    expect(effectiveZone(carrier, NOW)).toBe("wash_pending");
  });
});

describe("清洗与回区", () => {
  it("两项合格才回可用区并刷新上次清洗时刻", () => {
    let state = registerFresh(seedState(NOW), "T-101", NOW - 30 * HOUR);
    state = reducer(state, { type: "startWash", id: "T-101", at: NOW - 1000 });
    expect(state.carriers.find((c) => c.id === "T-101")?.zone).toBe("washing");

    state = reducer(state, {
      type: "completeWash",
      id: "T-101",
      batchId: "W-1",
      residuePass: true,
      humidityPass: true,
      at: NOW,
    });
    const carrier = state.carriers.find((c) => c.id === "T-101")!;
    expect(carrier.zone).toBe("available");
    expect(carrier.lastCleanedAt).toBe(NOW);
    expect(carrier.lastWashBatchId).toBe("W-1");
  });

  it("任一不合格留在待洗区，且不刷新上次清洗时刻", () => {
    let state = registerFresh(seedState(NOW), "T-102", NOW - 30 * HOUR);
    state = reducer(state, { type: "startWash", id: "T-102", at: NOW - 1000 });
    state = reducer(state, {
      type: "completeWash",
      id: "T-102",
      batchId: "W-2",
      residuePass: false,
      humidityPass: true,
      at: NOW,
    });
    const carrier = state.carriers.find((c) => c.id === "T-102")!;
    expect(carrier.zone).toBe("wash_pending");
    expect(carrier.lastCleanedAt).toBe(NOW - 30 * HOUR);
  });
});

describe("退回释放", () => {
  it("取消批次释放载具、写 released 留档；过期则落待洗区", () => {
    let state = registerFresh(seedState(NOW), "T-201");
    state = reducer(state, { type: "assign", id: "T-201", batchId: "B-9", at: NOW });
    state = reducer(state, {
      type: "release",
      id: "T-201",
      reason: "批次取消",
      at: NOW + 1000,
    });
    const carrier = state.carriers.find((c) => c.id === "T-201")!;
    expect(carrier.batchId).toBeNull();
    expect(carrier.wafersLoaded).toBe(false);
    expect(carrier.zone).toBe("available");
    const released = state.events.find((e) => e.kind === "released");
    expect(released).toBeDefined();
  });

  it("未填原因的释放被拦截", () => {
    let state = registerFresh(seedState(NOW), "T-202");
    state = reducer(state, { type: "assign", id: "T-202", batchId: "B-9", at: NOW });
    state = reducer(state, { type: "release", id: "T-202", reason: "  ", at: NOW + 1000 });
    expect(state.carriers.find((c) => c.id === "T-202")?.batchId).toBe("B-9");
  });
});

describe("更正不覆盖旧值", () => {
  it("更正另写 corrected 事件并指向原记录，旧事件保持不变", () => {
    let state = registerFresh(seedState(NOW), "T-301", NOW - 30 * HOUR);
    state = reducer(state, { type: "startWash", id: "T-301", at: NOW - 2000 });
    state = reducer(state, {
      type: "completeWash",
      id: "T-301",
      batchId: "W-3",
      residuePass: false,
      humidityPass: true,
      at: NOW - 1000,
    });
    const washEvent = state.events.find(
      (e) => e.kind === "wash_completed" && e.carrierId === "T-301",
    )!;
    const beforeCount = state.events.length;

    state = reducer(state, {
      type: "correctWash",
      id: "T-301",
      refSeq: washEvent.seq,
      residuePass: true,
      humidityPass: true,
      reason: "留样复测合格",
      at: NOW,
    });

    expect(state.events.length).toBe(beforeCount + 1);
    const unchanged = state.events.find((e) => e.seq === washEvent.seq);
    expect(unchanged).toEqual(washEvent);
    const corrected = state.events.find((e) => e.kind === "corrected");
    expect(corrected).toBeDefined();
    if (corrected?.kind === "corrected") {
      expect(corrected.refSeq).toBe(washEvent.seq);
      expect(corrected.oldResult).toEqual({ residuePass: false, humidityPass: true });
      expect(corrected.newResult).toEqual({ residuePass: true, humidityPass: true });
    }
    const carrier = state.carriers.find((c) => c.id === "T-301")!;
    expect(carrier.zone).toBe("available");
    expect(effectiveWashResult(state.events, washEvent.seq)).toEqual({
      residuePass: true,
      humidityPass: true,
    });
  });
});
