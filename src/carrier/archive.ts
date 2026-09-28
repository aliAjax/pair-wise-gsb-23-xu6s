import type { ArchiveEvent, ArchiveEventType, Carrier } from "./types";
import { HOUR_MS, makeId } from "./time";

/**
 * 留档：append-only 事件流。
 * 任何操作结果与更正都只往末尾追加，旧值随更正条目永久保留，
 * 本模块不提供修改/删除事件的方法。
 */

export const EVENT_META: Record<
  ArchiveEventType,
  { label: string; className: string }
> = {
  REGISTERED: { label: "登记", className: "ev-registered" },
  ALLOCATED: { label: "分配", className: "ev-allocated" },
  UNLOADED: { label: "卸片", className: "ev-unloaded" },
  WASH_RECORDED: { label: "清洗记录", className: "ev-wash" },
  RELEASED: { label: "退回/取消", className: "ev-released" },
  CORRECTED: { label: "结果更正", className: "ev-corrected" },
};

export interface EventInput {
  type: ArchiveEventType;
  operator: string;
  carrierId: string;
  batchId?: string | null;
  summary: string;
  detail?: ArchiveEvent["detail"];
  at?: number;
}

export function appendEvent(
  events: ArchiveEvent[],
  input: EventInput
): ArchiveEvent[] {
  const event: ArchiveEvent = {
    seq: events.length ? events[events.length - 1].seq + 1 : 1,
    id: makeId("EV"),
    at: input.at ?? Date.now(),
    type: input.type,
    operator: input.operator,
    carrierId: input.carrierId,
    batchId: input.batchId ?? null,
    summary: input.summary,
    detail: input.detail ?? {},
  };
  return [...events, event];
}

export function buildSeedArchive(carriers: Carrier[], now: number): ArchiveEvent[] {
  const ev = (
    events: ArchiveEvent[],
    type: ArchiveEventType,
    at: number,
    operator: string,
    carrierId: string,
    summary: string,
    detail: ArchiveEvent["detail"] = {},
    batchId: string | null = null
  ): ArchiveEvent[] =>
    appendEvent(events, { type, at, operator, carrierId, batchId, summary, detail });

  let events: ArchiveEvent[] = [];
  const c = Object.fromEntries(carriers.map((x) => [x.id, x]));

  events = ev(events, "REGISTERED", now - 30 * 24 * HOUR_MS, "班组长", "FOUP-1102", "载具登记入册，等级 ISO 5，清洗周期 72h");
  events = ev(events, "REGISTERED", now - 40 * 24 * HOUR_MS, "班组长", "FOUP-1103", "载具登记入册，等级 ISO 6，清洗周期 72h");
  events = ev(events, "REGISTERED", now - 60 * 24 * HOUR_MS, "班组长", "FOUP-2215", "载具登记入册，等级 黄光区，清洗周期 72h");
  events = ev(events, "REGISTERED", now - 55 * 24 * HOUR_MS, "班组长", "FOUP-2218", "载具登记入册，等级 ISO 7，清洗周期 72h");
  events = ev(events, "REGISTERED", now - 70 * 24 * HOUR_MS, "班组长", "FOUP-3306", "载具登记入册，等级 ISO 6，清洗周期 72h");
  events = ev(events, "REGISTERED", now - 35 * 24 * HOUR_MS, "班组长", "FOUP-3309", "载具登记入册，等级 ISO 5，清洗周期 48h");
  events = ev(events, "REGISTERED", now - 20 * 24 * HOUR_MS, "班组长", "FOUP-4421", "载具登记入册，等级 ISO 7，清洗周期 48h");

  events = ev(events, "WASH_RECORDED", now - 20 * HOUR_MS, "厂务工程师", "FOUP-1102", "清洗完成：残留检测合格、湿度复测合格，回可用区", {
    batch: "LOT-260920-F22",
    residual: "pass",
    humidity: "pass",
  }, "LOT-260920-F22");

  events = ev(events, "ALLOCATED", now - 14 * HOUR_MS, "班组长", "FOUP-1102", "分配给批次 LOT-260921-H03", {}, "LOT-260921-H03");
  events = ev(events, "UNLOADED", now - 4 * HOUR_MS, "巡检员", "FOUP-1102", "批次 LOT-260921-H03 卸片完成，载具释放", {}, "LOT-260921-H03");

  events = ev(events, "ALLOCATED", now - 26 * HOUR_MS, "班组长", "FOUP-1103", "分配给批次 LOT-260920-A07（注意：已超过 72h 清洗周期）", {}, "LOT-260920-A07");

  events = ev(events, "WASH_RECORDED", now - 6 * HOUR_MS, "厂务工程师", "FOUP-2215", "清洗登记：残留检测初判合格、湿度复测合格", {
    batch: "LOT-260918-G14",
    residual: "pass",
    humidity: "pass",
    washId: "W-2001",
  }, "LOT-260918-G14");
  events = ev(events, "CORRECTED", now - 5 * HOUR_MS, "厂务工程师", "FOUP-2215", "更正 W-2001 残留检测：合格 → 不合格（旧值保留）", {
    washId: "W-2001",
    field: "residual",
    oldValue: "pass",
    newValue: "fail",
    reason: c["FOUP-2215"].washRecords[0]?.corrections[0]?.reason ?? "",
  }, "LOT-260918-G14");

  events = ev(events, "ALLOCATED", now - 8 * HOUR_MS, "班组长", "FOUP-3306", "分配给批次 LOT-260919-C02（换线遗留：超期未卸）", {}, "LOT-260919-C02");
  events = ev(events, "ALLOCATED", now - 6 * HOUR_MS, "班组长", "FOUP-3309", "分配给批次 LOT-260921-B11", {}, "LOT-260921-B11");

  events = ev(events, "WASH_RECORDED", now - 2 * HOUR_MS, "厂务工程师", "FOUP-4421", "清洗登记：残留检测合格、湿度复测不合格，停留待洗区重洗", {
    batch: "LOT-260919-D05",
    residual: "pass",
    humidity: "fail",
    washId: "W-2002",
  }, "LOT-260919-D05");

  return events;
}
