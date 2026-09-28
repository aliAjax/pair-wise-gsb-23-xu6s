import { useMemo, useState } from "react";
import type { ArchiveEvent, ArchiveEventType } from "../carrier/types";
import { EVENT_META } from "../carrier/archive";
import { formatDateTime } from "../carrier/time";

const FILTERS: Array<ArchiveEventType | "ALL"> = [
  "ALL",
  "ALLOCATED",
  "UNLOADED",
  "WASH_RECORDED",
  "RELEASED",
  "CORRECTED",
  "REGISTERED",
];

function exportArchive(events: ArchiveEvent[]) {
  const payload = {
    exportName: "hxwl-09 载具周转留档",
    exportedAt: new Date().toISOString(),
    count: events.length,
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carrier-archive-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ArchivePanel({ events }: { events: ArchiveEvent[] }) {
  const [filter, setFilter] = useState<ArchiveEventType | "ALL">("ALL");

  const shown = useMemo(
    () =>
      filter === "ALL"
        ? [...events].reverse()
        : events.filter((e) => e.type === filter).reverse(),
    [events, filter]
  );

  return (
    <section className="panel archive-panel">
      <div className="section-heading">
        <div>
          <p>留档（append-only）</p>
          <h2>操作与更正记录</h2>
        </div>
        <button onClick={() => exportArchive(events)}>导出留档 JSON</button>
      </div>

      <div className="archive-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? "filter-on" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? `全部 (${events.length})` : EVENT_META[f].label}
          </button>
        ))}
      </div>

      <div className="archive-list">
        {shown.map((e) => {
          const meta = EVENT_META[e.type];
          return (
            <article key={e.id} className="archive-row">
              <div className="archive-seq">#{String(e.seq).padStart(3, "0")}</div>
              <div className="archive-body">
                <div className="archive-line">
                  <span className={`ev-tag ${meta.className}`}>{meta.label}</span>
                  <strong>{e.carrierId}</strong>
                  {e.batchId && <span className="batch-tag">{e.batchId}</span>}
                  <span className="muted">
                    {formatDateTime(e.at)} · {e.operator}
                  </span>
                </div>
                <p className="archive-summary">{e.summary}</p>
                {e.type === "CORRECTED" && (
                  <p className="archive-detail">
                    旧值：
                    <span className={e.detail.oldValue === "pass" ? "text-ok" : "text-danger"}>
                      {e.detail.oldValue === "pass" ? "合格" : "不合格"}
                    </span>
                    {" → "}新值：
                    <span className={e.detail.newValue === "pass" ? "text-ok" : "text-danger"}>
                      {e.detail.newValue === "pass" ? "合格" : "不合格"}
                    </span>
                    {" · "}原因：{e.detail.reason}
                  </p>
                )}
                {e.type === "RELEASED" && (
                  <p className="archive-detail muted">
                    {e.detail.kind === "return" ? "类型：退回" : "类型：取消"} ·{" "}
                    {e.detail.note}
                  </p>
                )}
                {e.type === "UNLOADED" && e.detail.note ? (
                  <p className="archive-detail muted">备注：{e.detail.note}</p>
                ) : null}
              </div>
            </article>
          );
        })}
        {shown.length === 0 && <p className="muted">该分类暂无记录。</p>}
      </div>
    </section>
  );
}
