// 准入判断：清洗是否过期、分配是否放行、洗完回区。只做规则计算，不写状态。

import type { ArchiveEvent, Carrier, Zone } from "./types";

const HOUR_MS = 3600_000;

export function washDeadline(carrier: Carrier): number {
  return carrier.lastCleanedAt + carrier.washCycleHours * HOUR_MS;
}

export function isWashExpired(carrier: Carrier, now: number): boolean {
  return now > washDeadline(carrier);
}

/** 清洗完成后两项检测均合格才回可用区，任一不合格停在待洗区 */
export function routeAfterWash(residuePass: boolean, humidityPass: boolean): Zone {
  return residuePass && humidityPass ? "available" : "wash_pending";
}

/**
 * 过期自动停在待洗区：即使 zone 仍为可用，只要清洗过期，实际就不参与分配。
 * 装片/占用中的载具保持周转中，待卸片或释放时再落待洗区。
 */
export function effectiveZone(carrier: Carrier, now: number): Zone {
  if (carrier.zone === "available" && isWashExpired(carrier, now)) {
    return "wash_pending";
  }
  return carrier.zone;
}

/** 分配准入：未卸片、清洗过期、不在可用区，任一命中即拦截 */
export function assignmentBlockers(carrier: Carrier | undefined, now: number): string[] {
  if (!carrier) {
    return ["载具编号未登记"];
  }
  const blockers: string[] = [];
  if (carrier.wafersLoaded || carrier.batchId) {
    blockers.push("载具仍装着上一批硅片，需先卸片");
  }
  if (carrier.zone !== "available") {
    blockers.push(`载具不在可用区（当前：${carrier.zone}）`);
  } else if (isWashExpired(carrier, now)) {
    blockers.push("清洗周期已过，停在待洗区");
  }
  return blockers;
}

/** 停在待洗区的原因，看板卡片展示用 */
export function holdReason(carrier: Carrier, now: number): string {
  if (carrier.residuePass === false || carrier.humidityPass === false) {
    const failed: string[] = [];
    if (carrier.residuePass === false) failed.push("残留检测");
    if (carrier.humidityPass === false) failed.push("湿度复测");
    return `${failed.join("、")}不合格`;
  }
  if (isWashExpired(carrier, now)) return "清洗周期已过";
  return "待清洗";
}

/** 找到某载具最近一次清洗结果事件（wash_completed），更正时需引用原事件留档 */
export function latestWashEvent(events: ArchiveEvent[], carrierId: string): ArchiveEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (
      event.carrierId === carrierId &&
      (event.kind === "wash_completed" ||
        (event.kind === "corrected" &&
          events[i - 1] &&
          events[i - 1].carrierId === carrierId))
    ) {
      if (event.kind === "wash_completed") return event;
    }
  }
  return undefined;
}
