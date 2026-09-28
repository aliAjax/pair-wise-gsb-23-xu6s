// 周转台领域模型：载具资料、流转状态与留档事件

export type CarrierGrade = "ISO 5" | "ISO 6" | "ISO 7";

export const CARRIER_GRADES: CarrierGrade[] = ["ISO 5", "ISO 6", "ISO 7"];

/** 载具所在区：可用区 / 周转中 / 待洗区 / 清洗中 */
export type Zone = "available" | "in_use" | "wash_pending" | "washing";

export const ZONE_LABELS: Record<Zone, string> = {
  available: "可用区",
  in_use: "周转中",
  wash_pending: "待洗区",
  washing: "清洗中",
};

/**
 * 载具资料。
 * 编号、等级、清洗周期为登记主数据；lastCleanedAt/batchId/zone 为当前周转状态。
 */
export interface Carrier {
  id: string;
  grade: CarrierGrade;
  registeredAt: number;
  /** 清洗周期（小时），到期后未重洗不得分配 */
  washCycleHours: number;
  /** 上次清洗合格时刻 */
  lastCleanedAt: number;
  /** 最近一次清洗批次 */
  lastWashBatchId: string | null;
  /** 当前占用的生产批次；未卸片前不得清空 */
  batchId: string | null;
  /** 载具内是否仍装着上一批硅片 */
  wafersLoaded: boolean;
  zone: Zone;
  /** 最近一次（含更正后）残留检测结果 */
  residuePass: boolean | null;
  /** 最近一次（含更正后）湿度复测结果 */
  humidityPass: boolean | null;
}

export type ArchiveKind =
  | "registered"
  | "assigned"
  | "unloaded"
  | "wash_held"
  | "wash_started"
  | "wash_completed"
  | "released"
  | "corrected"
  | "blocked";

/** 留档事件：只允许追加，更正也以新事件写入，不覆盖旧事件 */
export type ArchiveEvent =
  | {
      seq: number;
      at: number;
      kind: "registered";
      carrierId: string;
      grade: CarrierGrade;
      lastCleanedAt: number;
      washCycleHours: number;
    }
  | { seq: number; at: number; kind: "assigned"; carrierId: string; batchId: string }
  | {
      seq: number;
      at: number;
      kind: "unloaded";
      carrierId: string;
      batchId: string;
      routedTo: Zone;
    }
  | { seq: number; at: number; kind: "wash_held"; carrierId: string; holdReason: string }
  | { seq: number; at: number; kind: "wash_started"; carrierId: string }
  | {
      seq: number;
      at: number;
      kind: "wash_completed";
      carrierId: string;
      batchId: string;
      residuePass: boolean;
      humidityPass: boolean;
      accepted: boolean;
    }
  | {
      seq: number;
      at: number;
      kind: "released";
      carrierId: string;
      batchId: string;
      releaseReason: string;
      routedTo: Zone;
    }
  | {
      seq: number;
      at: number;
      kind: "corrected";
      carrierId: string;
      refSeq: number;
      oldResult: { residuePass: boolean; humidityPass: boolean };
      newResult: { residuePass: boolean; humidityPass: boolean };
      correctReason: string;
    }
  | {
      seq: number;
      at: number;
      kind: "blocked";
      carrierId: string;
      blockedAction: string;
      blockedReasons: string[];
    };

export interface TurnoverState {
  carriers: Carrier[];
  events: ArchiveEvent[];
}

export type TurnoverAction =
  | {
      type: "register";
      id: string;
      grade: CarrierGrade;
      lastCleanedAt: number;
      washCycleHours: number;
      at?: number;
    }
  | { type: "assign"; id: string; batchId: string; at?: number }
  | { type: "unload"; id: string; at?: number }
  | { type: "release"; id: string; reason: string; at?: number }
  | { type: "startWash"; id: string; at?: number }
  | {
      type: "completeWash";
      id: string;
      batchId: string;
      residuePass: boolean;
      humidityPass: boolean;
      at?: number;
    }
  | {
      type: "correctWash";
      id: string;
      refSeq: number;
      residuePass: boolean;
      humidityPass: boolean;
      reason: string;
      at?: number;
    }
  | { type: "reset" };
