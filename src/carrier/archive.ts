// 留档：事件只追加不改写；更正另写原因并指向原事件。提供查询与更正链追溯，不承载业务流转。

import type { ArchiveEvent, TurnoverState } from "./types";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type NewEvent = DistributiveOmit<ArchiveEvent, "seq" | "at">;

/** 追加留档事件；所有流转必须经此入口，旧事件不允许修改 */
export function appendEvent(events: ArchiveEvent[], draft: NewEvent, at: number): ArchiveEvent {
  const seq = events.length === 0 ? 1 : events[events.length - 1].seq + 1;
  const event = { ...draft, seq, at } as ArchiveEvent;
  events.push(event);
  return event;
}

export function findWashCompleted(
  events: ArchiveEvent[],
  seq: number,
): Extract<ArchiveEvent, { kind: "wash_completed" }> | undefined {
  return events.find(
    (e): e is Extract<ArchiveEvent, { kind: "wash_completed" }> =>
      e.seq === seq && e.kind === "wash_completed",
  );
}

/** 沿更正链追溯某次清洗当前生效的结果；旧值保留在各更正事件里 */
export function effectiveWashResult(
  events: ArchiveEvent[],
  washSeq: number,
): { residuePass: boolean; humidityPass: boolean } {
  const base = findWashCompleted(events, washSeq);
  let result = {
    residuePass: base?.residuePass ?? false,
    humidityPass: base?.humidityPass ?? false,
  };
  for (const e of events) {
    if (e.kind === "corrected" && e.refSeq === washSeq) {
      result = { residuePass: e.newResult.residuePass, humidityPass: e.newResult.humidityPass };
    }
  }
  return result;
}

/** 某载具最近一次清洗（wash_completed）事件，留档面板“更正”按钮挂在该事件上 */
export function latestWashCompleted(
  events: ArchiveEvent[],
  carrierId: string,
): Extract<ArchiveEvent, { kind: "wash_completed" }> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.carrierId === carrierId && e.kind === "wash_completed") {
      return e;
    }
  }
  return undefined;
}

export function carrierEvents(
  state: TurnoverState,
  carrierId: string | null,
): ArchiveEvent[] {
  if (!carrierId) return state.events;
  return state.events.filter((e) => e.carrierId === carrierId);
}

/** 该清洗事件被更正过的次数，面板上标注“已更正 n 次” */
export function correctionCount(events: ArchiveEvent[], washSeq: number): number {
  return events.filter((e) => e.kind === "corrected" && e.refSeq === washSeq).length;
}
