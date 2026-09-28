// 载具周转台领域模型

export type Grade = "ISO 5" | "ISO 6" | "ISO 7" | "黄光区";

export type TestResult = "pass" | "fail";

/** 周转分区：可用区 / 周转中（未卸片） / 待洗区 */
export type Zone = "AVAILABLE" | "IN_USE" | "WASH_PENDING";

export type CheckField = "residual" | "humidity";

export type ReleaseKind = "return" | "cancel";

export interface WashCheck {
  /** 合格 / 不合格，准入只认这个结论 */
  result: TestResult;
  /** 实测值原文，如 离子残留 0.02 µg/cm²、相对湿度 40%RH */
  measured: string;
}

/** 更正条目：只追加，原始结果保留在 WashRecord 上不改写 */
export interface WashCorrection {
  id: string;
  field: CheckField;
  oldValue: TestResult;
  newValue: TestResult;
  reason: string;
  at: number;
  operator: string;
}

/** 一次清洗记录：批次 + 残留检测 + 湿度复测 */
export interface WashRecord {
  id: string;
  carrierId: string;
  batchId: string;
  completedAt: number;
  residual: WashCheck;
  humidity: WashCheck;
  operator: string;
  corrections: WashCorrection[];
}

export interface Carrier {
  /** 载具编号，唯一 */
  id: string;
  /** 洁净等级 */
  grade: Grade;
  /** 清洗周期（小时） */
  cycleHours: number;
  /** 登记时填写的上次清洗时刻 */
  registeredCleanedAt: number;
  createdAt: number;
  /** 当前装载批次；非 null 即“还装着硅片”，未卸片前禁止再分配 */
  batchId: string | null;
  /** 清洗记录按时间倒序追加 */
  washRecords: WashRecord[];
}

export type ArchiveEventType =
  | "REGISTERED"
  | "ALLOCATED"
  | "UNLOADED"
  | "WASH_RECORDED"
  | "RELEASED"
  | "CORRECTED";

/** 留档事件：append-only，不允许修改、删除 */
export interface ArchiveEvent {
  seq: number;
  id: string;
  type: ArchiveEventType;
  at: number;
  operator: string;
  carrierId: string;
  batchId?: string | null;
  summary: string;
  detail: Record<string, string | number | boolean | null>;
}
