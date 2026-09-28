import type { Carrier, Grade, WashRecord } from "./types";
import { HOUR_MS } from "./time";

/**
 * 载具资料：在册信息与清洗记录的登记/读取。
 * 这里只管数据本身；能不能分配、回哪个区看 eligibility.ts，
 * 谁做了什么、为什么改看 archive.ts。
 */

export const GRADES: Grade[] = ["ISO 5", "ISO 6", "ISO 7", "黄光区"];

export const DEFAULT_CYCLE_HOURS = 72;

export interface RegisterInput {
  id: string;
  grade: Grade;
  cycleHours: number;
  lastCleanedAt: number;
}

export function createCarrier(input: RegisterInput, now: number): Carrier {
  return {
    id: input.id.trim().toUpperCase(),
    grade: input.grade,
    cycleHours: input.cycleHours,
    registeredCleanedAt: input.lastCleanedAt,
    createdAt: now,
    batchId: null,
    washRecords: [],
  };
}

export function findCarrier(
  carriers: Carrier[],
  id: string
): Carrier | undefined {
  const key = id.trim().toUpperCase();
  return carriers.find((c) => c.id === key);
}

export function duplicateId(carriers: Carrier[], id: string): boolean {
  return Boolean(findCarrier(carriers, id));
}

/** 演示数据：覆盖 可用/未卸片/过期/双检不合格/更正 各种情形 */
export function seedCarriers(now: number): Carrier[] {
  const correctedWash: WashRecord = {
    id: "W-2001",
    carrierId: "FOUP-2215",
    batchId: "LOT-260918-G14",
    completedAt: now - 6 * HOUR_MS,
    residual: { result: "pass", measured: "离子残留 0.02 µg/cm²（初测）" },
    humidity: { result: "pass", measured: "相对湿度 39%RH（初测）" },
    operator: "厂务工程师",
    corrections: [
      {
        id: "C-2001",
        field: "residual",
        oldValue: "pass",
        newValue: "fail",
        reason:
          "复检发现金属离子残留复测偏高（0.11 µg/cm²），初测留样异常，改判不合格并安排重洗",
        at: now - 5 * HOUR_MS,
        operator: "厂务工程师",
      },
    ],
  };

  const failedWash: WashRecord = {
    id: "W-2002",
    carrierId: "FOUP-4421",
    batchId: "LOT-260919-D05",
    completedAt: now - 2 * HOUR_MS,
    residual: { result: "pass", measured: "离子残留 0.03 µg/cm²" },
    humidity: { result: "fail", measured: "相对湿度 53%RH（限值 ≤45%RH）" },
    operator: "厂务工程师",
    corrections: [],
  };

  return [
    {
      id: "FOUP-1102",
      grade: "ISO 5",
      cycleHours: 72,
      registeredCleanedAt: now - 20 * HOUR_MS,
      createdAt: now - 30 * 24 * HOUR_MS,
      batchId: null,
      washRecords: [],
    },
    {
      id: "FOUP-1103",
      grade: "ISO 6",
      cycleHours: 72,
      registeredCleanedAt: now - 90 * HOUR_MS,
      createdAt: now - 40 * 24 * HOUR_MS,
      batchId: "LOT-260920-A07",
      washRecords: [],
    },
    {
      id: "FOUP-2215",
      grade: "黄光区",
      cycleHours: 72,
      registeredCleanedAt: now - 100 * HOUR_MS,
      createdAt: now - 60 * 24 * HOUR_MS,
      batchId: null,
      washRecords: [correctedWash],
    },
    {
      id: "FOUP-2218",
      grade: "ISO 7",
      cycleHours: 72,
      registeredCleanedAt: now - 96 * HOUR_MS,
      createdAt: now - 55 * 24 * HOUR_MS,
      batchId: null,
      washRecords: [],
    },
    {
      id: "FOUP-3306",
      grade: "ISO 6",
      cycleHours: 72,
      registeredCleanedAt: now - 300 * HOUR_MS,
      createdAt: now - 70 * 24 * HOUR_MS,
      batchId: "LOT-260919-C02",
      washRecords: [],
    },
    {
      id: "FOUP-3309",
      grade: "ISO 5",
      cycleHours: 48,
      registeredCleanedAt: now - 10 * HOUR_MS,
      createdAt: now - 35 * 24 * HOUR_MS,
      batchId: "LOT-260921-B11",
      washRecords: [],
    },
    {
      id: "FOUP-4421",
      grade: "ISO 7",
      cycleHours: 48,
      registeredCleanedAt: now - 50 * HOUR_MS,
      createdAt: now - 20 * 24 * HOUR_MS,
      batchId: null,
      washRecords: [failedWash],
    },
  ];
}
