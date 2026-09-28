import { useSyncExternalStore } from "react";
import type {
  ArchiveEvent,
  Carrier,
  CheckField,
  ReleaseKind,
  TestResult,
  WashRecord,
} from "./types";
import {
  allocateCheck,
  canRecordWash,
  getZone,
  washPassed,
} from "./eligibility";
import {
  createCarrier,
  duplicateId,
  seedCarriers,
  type RegisterInput,
} from "./registry";
import { appendEvent, buildSeedArchive } from "./archive";
import { makeId } from "./time";

const STORAGE_KEY = "hxwl-09-turnover-v1";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface WashInput {
  batchId: string;
  residual: TestResult;
  residualMeasured: string;
  humidity: TestResult;
  humidityMeasured: string;
  operator: string;
  completedAt: number;
}

export interface CorrectInput {
  washId: string;
  field: CheckField;
  newValue: TestResult;
  reason: string;
}

export interface TurnoverState {
  carriers: Carrier[];
  events: ArchiveEvent[];
  operator: string;
}

export function seedState(): TurnoverState {
  const now = Date.now();
  const carriers = seedCarriers(now);
  return { carriers, events: buildSeedArchive(carriers, now), operator: "巡检员" };
}

function loadInitial(): TurnoverState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TurnoverState;
      if (Array.isArray(parsed.carriers) && Array.isArray(parsed.events)) {
        return {
          carriers: parsed.carriers,
          events: parsed.events,
          operator: parsed.operator || "巡检员",
        };
      }
    }
  } catch {
    // 存档不可读时回到演示数据
  }
  return seedState();
}

/**
 * 周转控制器：与 React 无关的状态核心。
 * 所有业务动作在这里改状态并同步往留档追加事件；
 * 界面只通过 useTurnoverStore 订阅。
 */
export class TurnoverController {
  private state: TurnoverState;
  private listeners = new Set<() => void>();

  constructor(initial?: TurnoverState) {
    this.state = initial ?? loadInitial();
  }

  getState = (): TurnoverState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: TurnoverState) {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 存储空间不可用时仅保留当前会话
    }
    this.listeners.forEach((l) => l());
  }

  setOperator(operator: string) {
    this.commit({ ...this.state, operator });
  }

  resetDemo() {
    this.commit(seedState());
  }

  registerCarrier(input: RegisterInput): ActionResult {
    const { carriers, events, operator } = this.state;
    const id = input.id.trim();
    if (!id) return { ok: false, error: "请填写载具编号" };
    if (!/^[A-Za-z0-9-_]+$/.test(id))
      return { ok: false, error: "编号仅支持字母、数字、连字符" };
    if (duplicateId(carriers, id))
      return { ok: false, error: `编号 ${id.toUpperCase()} 已登记` };
    if (!input.cycleHours || input.cycleHours <= 0)
      return { ok: false, error: "清洗周期须为正数（小时）" };
    if (!Number.isFinite(input.lastCleanedAt))
      return { ok: false, error: "请选择有效的上次清洗时刻" };

    const carrier = createCarrier(input, Date.now());
    this.commit({
      ...this.state,
      carriers: [...carriers, carrier],
      events: appendEvent(events, {
        type: "REGISTERED",
        operator,
        carrierId: carrier.id,
        summary: `载具登记入册，等级 ${carrier.grade}，清洗周期 ${carrier.cycleHours}h`,
        detail: {
          grade: carrier.grade,
          cycleHours: carrier.cycleHours,
          lastCleanedAt: new Date(carrier.registeredCleanedAt).toISOString(),
        },
      }),
    });
    return { ok: true };
  }

  allocate(carrierId: string, batchId: string): ActionResult {
    const { carriers, events, operator } = this.state;
    const carrier = carriers.find((c) => c.id === carrierId);
    if (!carrier) return { ok: false, error: "载具不存在" };
    const batch = batchId.trim();
    if (!batch) return { ok: false, error: "请填写要分配的批次号" };
    const check = allocateCheck(carrier, Date.now());
    if (!check.ok) return { ok: false, error: check.reason };

    this.commit({
      ...this.state,
      carriers: carriers.map((c) =>
        c.id === carrierId ? { ...c, batchId: batch } : c
      ),
      events: appendEvent(events, {
        type: "ALLOCATED",
        operator,
        carrierId,
        batchId: batch,
        summary: `分配给批次 ${batch}`,
      }),
    });
    return { ok: true };
  }

  unload(carrierId: string, note: string): ActionResult {
    const { carriers, events, operator } = this.state;
    const carrier = carriers.find((c) => c.id === carrierId);
    if (!carrier) return { ok: false, error: "载具不存在" };
    if (!carrier.batchId)
      return { ok: false, error: "该载具未装载批次，无需卸片" };

    const batch = carrier.batchId;
    const nextZone = getZone({ ...carrier, batchId: null }, Date.now());
    this.commit({
      ...this.state,
      carriers: carriers.map((c) =>
        c.id === carrierId ? { ...c, batchId: null } : c
      ),
      events: appendEvent(events, {
        type: "UNLOADED",
        operator,
        carrierId,
        batchId: batch,
        summary:
          nextZone === "WASH_PENDING"
            ? `批次 ${batch} 卸片完成；清洗已过期，载具转入待洗区`
            : `批次 ${batch} 卸片完成，载具回可用区`,
        detail: { note: note.trim(), nextZone },
      }),
    });
    return { ok: true };
  }

  recordWash(carrierId: string, input: WashInput): ActionResult {
    const { carriers, events } = this.state;
    const carrier = carriers.find((c) => c.id === carrierId);
    if (!carrier) return { ok: false, error: "载具不存在" };
    if (!input.batchId.trim())
      return { ok: false, error: "请填写本次清洗对应的批次号" };
    if (!canRecordWash(carrier, Date.now()))
      return { ok: false, error: "只有待洗区载具才能登记清洗结果" };

    const record: WashRecord = {
      id: makeId("W"),
      carrierId,
      batchId: input.batchId.trim(),
      completedAt: input.completedAt,
      residual: {
        result: input.residual,
        measured: input.residualMeasured.trim(),
      },
      humidity: {
        result: input.humidity,
        measured: input.humidityMeasured.trim(),
      },
      operator: input.operator.trim() || this.state.operator,
      corrections: [],
    };
    const passed = washPassed(record);
    this.commit({
      ...this.state,
      carriers: carriers.map((c) =>
        c.id === carrierId
          ? { ...c, batchId: null, washRecords: [record, ...c.washRecords] }
          : c
      ),
      events: appendEvent(events, {
        type: "WASH_RECORDED",
        operator: record.operator,
        carrierId,
        batchId: record.batchId,
        summary: passed
          ? `清洗完成（${record.batchId}）：残留检测、湿度复测均合格，回可用区`
          : `清洗登记（${record.batchId}）：${
              input.residual === "fail" ? "残留检测不合格" : ""
            }${
              input.residual === "fail" && input.humidity === "fail" ? "、" : ""
            }${
              input.humidity === "fail" ? "湿度复测不合格" : ""
            }，停留待洗区重洗`,
        detail: {
          washId: record.id,
          residual: input.residual,
          humidity: input.humidity,
          returnedToAvailable: passed,
        },
      }),
    });
    return { ok: true };
  }

  release(carrierId: string, kind: ReleaseKind, note: string): ActionResult {
    const { carriers, events, operator } = this.state;
    const carrier = carriers.find((c) => c.id === carrierId);
    if (!carrier) return { ok: false, error: "载具不存在" };
    if (!carrier.batchId)
      return { ok: false, error: "该载具未装载批次，无需释放" };
    if (!note.trim())
      return {
        ok: false,
        error:
          kind === "return"
            ? "退回需填写说明（批次/退回原因）"
            : "取消批次需填写原因，便于追溯",
      };

    const batch = carrier.batchId;
    const nextZone = getZone({ ...carrier, batchId: null }, Date.now());
    this.commit({
      ...this.state,
      carriers: carriers.map((c) =>
        c.id === carrierId ? { ...c, batchId: null } : c
      ),
      events: appendEvent(events, {
        type: "RELEASED",
        operator,
        carrierId,
        batchId: batch,
        summary: `${kind === "return" ? "批次退回" : "批次取消"}：${batch} 释放载具，转入${
          nextZone === "WASH_PENDING" ? "待洗区（清洗过期）" : "可用区"
        }`,
        detail: { kind, note: note.trim() },
      }),
    });
    return { ok: true };
  }

  correctWash(carrierId: string, input: CorrectInput): ActionResult {
    const { carriers, events, operator } = this.state;
    const carrier = carriers.find((c) => c.id === carrierId);
    if (!carrier) return { ok: false, error: "载具不存在" };
    const record = carrier.washRecords.find((r) => r.id === input.washId);
    if (!record) return { ok: false, error: "清洗记录不存在" };
    if (!input.reason.trim())
      return { ok: false, error: "更正必须填写原因，旧值会原样保留" };

    const prior = record.corrections.filter((c) => c.field === input.field);
    const oldValue = prior.length
      ? prior[prior.length - 1].newValue
      : record[input.field].result;
    if (oldValue === input.newValue)
      return { ok: false, error: "新结论与现行值相同，无需更正" };

    const correction = {
      id: makeId("C"),
      field: input.field,
      oldValue,
      newValue: input.newValue,
      reason: input.reason.trim(),
      at: Date.now(),
      operator,
    };
    this.commit({
      ...this.state,
      carriers: carriers.map((c) =>
        c.id === carrierId
          ? {
              ...c,
              washRecords: c.washRecords.map((r) =>
                r.id === input.washId
                  ? { ...r, corrections: [...r.corrections, correction] }
                  : r
              ),
            }
          : c
      ),
      events: appendEvent(events, {
        type: "CORRECTED",
        operator,
        carrierId,
        batchId: record.batchId,
        summary: `更正清洗 ${record.id}（${record.batchId}）${
          input.field === "residual" ? "残留检测" : "湿度复测"
        }：${oldValue === "pass" ? "合格" : "不合格"} → ${
          input.newValue === "pass" ? "合格" : "不合格"
        }（旧值保留）`,
        detail: {
          washId: record.id,
          field: input.field,
          oldValue,
          newValue: input.newValue,
          reason: input.reason.trim(),
        },
      }),
    });
    return { ok: true };
  }
}

/** 页面级单例：整页共享同一个控制器与同一份 localStorage 数据 */
let controller: TurnoverController | null = null;
function getController(): TurnoverController {
  if (!controller) controller = new TurnoverController();
  return controller;
}

export function useTurnoverStore() {
  const ctrl = getController();
  const state = useSyncExternalStore(ctrl.subscribe, ctrl.getState, ctrl.getState);
  return {
    ...state,
    setOperator: (operator: string) => ctrl.setOperator(operator),
    registerCarrier: (input: RegisterInput) => ctrl.registerCarrier(input),
    allocate: (carrierId: string, batchId: string) =>
      ctrl.allocate(carrierId, batchId),
    unload: (carrierId: string, note: string) => ctrl.unload(carrierId, note),
    recordWash: (carrierId: string, input: WashInput) =>
      ctrl.recordWash(carrierId, input),
    release: (carrierId: string, kind: ReleaseKind, note: string) =>
      ctrl.release(carrierId, kind, note),
    correctWash: (carrierId: string, input: CorrectInput) =>
      ctrl.correctWash(carrierId, input),
    resetDemo: () => ctrl.resetDemo(),
  };
}

/** 看板概览统计（纯展示用） */
export function summarize(carriers: Carrier[], now: number) {
  const zones = { AVAILABLE: 0, IN_USE: 0, WASH_PENDING: 0 };
  let blockedAllocate = 0;

  for (const c of carriers) {
    zones[getZone(c, now)] += 1;
    if (!allocateCheck(c, now).ok) blockedAllocate += 1;
  }
  return {
    zones,
    blockedAllocate,
    pendingWashCount: zones.WASH_PENDING,
  };
}
