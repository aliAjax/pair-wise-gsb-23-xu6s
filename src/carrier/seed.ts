// 初始演示台账：登记、分配、清洗、退回等事件按顺序回放，构造与真实流转一致的载具资料。

import { assignmentBlockers, routeAfterWash } from "./admission";
import type {
  ArchiveEvent,
  ArchiveKind,
  Carrier,
  CarrierGrade,
  TurnoverState,
  Zone,
} from "./types";

const HOUR = 3600_000;

let seq = 0;

function event<T extends Omit<ArchiveEvent, "seq" | "at">>(
  base: T,
  at: number,
): T & { seq: number; at: number } {
  seq += 1;
  return { ...base, seq, at } as T & { seq: number; at: number };
}

function build(now: number): TurnoverState {
  seq = 0;
  const carriers: Carrier[] = [];
  const events: ArchiveEvent[] = [];

  const push = (e: ArchiveEvent) => events.push(e);

  function register(
    id: string,
    grade: CarrierGrade,
    cycleHours: number,
    lastCleanedAt: number,
    batch: string,
  ) {
    push(
      event(
        {
          kind: "registered",
          carrierId: id,
          grade,
          lastCleanedAt,
          washCycleHours: cycleHours,
        },
        lastCleanedAt - 2 * HOUR,
      ),
    );
    push(
      event(
        {
          kind: "wash_completed",
          carrierId: id,
          batchId: batch,
          residuePass: true,
          humidityPass: true,
          accepted: true,
        },
        lastCleanedAt,
      ),
    );
    carriers.push({
      id,
      grade,
      registeredAt: lastCleanedAt - 2 * HOUR,
      washCycleHours: cycleHours,
      lastCleanedAt,
      lastWashBatchId: batch,
      batchId: null,
      wafersLoaded: false,
      zone: "available",
      residuePass: true,
      humidityPass: true,
    });
  }

  function assign(id: string, batchId: string, at: number) {
    const carrier = carriers.find((c) => c.id === id);
    if (!carrier) return;
    const blockers = assignmentBlockers(carrier, at);
    if (blockers.length > 0) {
      push(event({ kind: "blocked", carrierId: id, blockedAction: "分配", blockedReasons: blockers }, at));
      return;
    }
    carrier.batchId = batchId;
    carrier.wafersLoaded = true;
    carrier.zone = "in_use";
    push(event({ kind: "assigned", carrierId: id, batchId }, at));
  }

  function finishWashFailing(id: string, batchId: string, at: number, residuePass: boolean, humidityPass: boolean) {
    const carrier = carriers.find((c) => c.id === id);
    if (!carrier) return;
    push(event({ kind: "wash_started", carrierId: id }, at - HOUR));
    carrier.zone = "washing";
    const accepted = residuePass && humidityPass;
    push(
      event({ kind: "wash_completed", carrierId: id, batchId, residuePass, humidityPass, accepted }, at),
    );
    carrier.zone = routeAfterWash(residuePass, humidityPass);
    carrier.residuePass = residuePass;
    carrier.humidityPass = humidityPass;
    carrier.lastWashBatchId = batchId;
  }

  // C-101：刚洗完回可用区，可直接分配
  register("C-101", "ISO 5", 24, now - 3 * HOUR, "W-2409-261");
  // C-102：装着上一批硅片，未卸片
  register("C-102", "ISO 5", 24, now - 8 * HOUR, "W-2409-258");
  assign("C-102", "B-2409-311", now - 6 * HOUR);
  // C-103：空载具但清洗周期已过（2 小时前到期），应自动停待洗区
  register("C-103", "ISO 6", 12, now - 14 * HOUR, "W-2409-255");
  // C-104：残留检测不合格，停在待洗区（并有一次被拦的分配尝试）
  register("C-104", "ISO 7", 16, now - 30 * HOUR, "W-2409-240");
  finishWashFailing("C-104", "W-2409-259", now - 26 * HOUR, false, true);
  assign("C-104", "B-2409-312", now - 25 * HOUR);
  // C-105：正在清洗中
  register("C-105", "ISO 6", 12, now - 40 * HOUR, "W-2409-230");
  push(event({ kind: "wash_started", carrierId: "C-105" }, now - 20 * 60_000));
  {
    const carrier = carriers.find((c) => c.id === "C-105");
    if (carrier) carrier.zone = "washing";
  }
  // C-106：上一批取消退回、已释放，且清洗未过期，回到可用区
  register("C-106", "ISO 7", 24, now - 5 * HOUR, "W-2409-257");
  assign("C-106", "B-2409-308", now - 4 * HOUR);
  {
    const carrier = carriers.find((c) => c.id === "C-106");
    if (carrier) {
      carrier.batchId = null;
      carrier.wafersLoaded = false;
      carrier.zone = "available";
      push(
        event(
          {
            kind: "released",
            carrierId: "C-106",
            batchId: "B-2409-308",
            releaseReason: "批次取消，载具退回",
            routedTo: "available" as Zone,
          },
          now - 2 * HOUR,
        ),
      );
    }
  }

  return { carriers, events };
}

export function seedState(now: number = Date.now()): TurnoverState {
  return build(now);
}

export const ARCHIVE_KIND_LABELS: Record<ArchiveKind, string> = {
  registered: "登记",
  assigned: "分配",
  unloaded: "卸片",
  wash_held: "停待洗",
  wash_started: "开始清洗",
  wash_completed: "清洗完成",
  released: "退回释放",
  corrected: "结果更正",
  blocked: "拦截",
};
