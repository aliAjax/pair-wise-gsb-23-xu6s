import type {
  Carrier,
  CheckField,
  TestResult,
  WashRecord,
  Zone,
} from "./types";
import { HOUR_MS } from "./time";

/**
 * 准入判断：全部为纯函数，界面与 store 共用同一套规则，
 * 任何分配/回区拦截都以这里的结论为准。
 */

export const ZONE_ORDER: Zone[] = ["AVAILABLE", "IN_USE", "WASH_PENDING"];

export const ZONE_META: Record<
  Zone,
  { label: string; hint: string; dot: string }
> = {
  AVAILABLE: {
    label: "可用区",
    hint: "已卸片且清洗在周期内，可分配给新批次",
    dot: "zone-available",
  },
  IN_USE: {
    label: "周转中 · 未卸片",
    hint: "仍装着本批硅片，未卸片前禁止再次分配",
    dot: "zone-inuse",
  },
  WASH_PENDING: {
    label: "待洗区",
    hint: "清洗周期已过或双检未合格，停用待洗",
    dot: "zone-pending",
  },
};

export function effectiveResult(
  record: WashRecord,
  field: CheckField
): TestResult {
  const list = record.corrections.filter((c) => c.field === field);
  // 原始值永不改写，更正只追加，取最近一次更正为现行值
  return list.length > 0 ? list[list.length - 1].newValue : record[field].result;
}

/** 双检（残留检测 + 湿度复测）同时合格才算合格 */
export function washPassed(record: WashRecord): boolean {
  return (
    effectiveResult(record, "residual") === "pass" &&
    effectiveResult(record, "humidity") === "pass"
  );
}

/** 现行有效的上次清洗时刻：最近一次双检合格时刻，没有则用登记值 */
export function lastQualifiedCleanAt(carrier: Carrier): number {
  const hit = carrier.washRecords.find((r) => washPassed(r));
  return hit ? hit.completedAt : carrier.registeredCleanedAt;
}

export function cleaningDeadline(carrier: Carrier): number {
  return lastQualifiedCleanAt(carrier) + carrier.cycleHours * HOUR_MS;
}

export function isCleaningExpired(carrier: Carrier, now: number): boolean {
  return now >= cleaningDeadline(carrier);
}

/** 分区由规则推导：有批次=未卸片；无批次看过期与否 */
export function getZone(carrier: Carrier, now: number): Zone {
  if (carrier.batchId) return "IN_USE";
  return isCleaningExpired(carrier, now) ? "WASH_PENDING" : "AVAILABLE";
}

export interface AllocateCheck {
  ok: boolean;
  code: "OK" | "LOADED" | "EXPIRED";
  reason: string;
}

/** 分配拦截：未卸片 / 清洗过期停在待洗区，一律不放行 */
export function allocateCheck(
  carrier: Carrier,
  now: number
): AllocateCheck {
  if (carrier.batchId) {
    return {
      ok: false,
      code: "LOADED",
      reason: `未卸片：仍装着批次 ${carrier.batchId} 的硅片`,
    };
  }
  if (getZone(carrier, now) === "WASH_PENDING") {
    return {
      ok: false,
      code: "EXPIRED",
      reason: "清洗周期已过，停在待洗区，双检合格前不可分配",
    };
  }
  return { ok: true, code: "OK", reason: "" };
}

/** 只有待洗区的载具才能登记清洗结果 */
export function canRecordWash(carrier: Carrier, now: number): boolean {
  return getZone(carrier, now) === "WASH_PENDING";
}

export const RESULT_LABEL: Record<TestResult, string> = {
  pass: "合格",
  fail: "不合格",
};

export const FIELD_LABEL: Record<CheckField, string> = {
  residual: "残留检测",
  humidity: "湿度复测",
};
