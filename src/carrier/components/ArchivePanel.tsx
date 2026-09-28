import { useState } from "react";
import { correctionCount, latestWashCompleted } from "../archive";
import { useTurnover } from "../store";
import { ARCHIVE_KIND_LABELS } from "../seed";
import type { ArchiveEvent } from "../types";
import { formatDateTime } from "../time";

function resultText(pass: boolean) {
  return pass ? "合格" : "不合格";
}

function EventDetail({ event }: { event: ArchiveEvent }) {
  switch (event.kind) {
    case "registered":
      return (
        <>
          等级 {event.grade} · 周期 {event.washCycleHours}h · 上次清洗{" "}
          {formatDateTime(event.lastCleanedAt)}
        </>
      );
    case "assigned":
      return <>分配至批次 {event.batchId}，载具装片周转</>;
    case "unloaded":
      return (
        <>
          批次 {event.batchId} 已卸片，载具进入
          {event.routedTo === "available" ? "可用区" : "待洗区"}
        </>
      );
    case "wash_held":
      return <>{event.holdReason}，载具停在待洗区</>;
    case "wash_started":
      return <>载具送入清洗</>;
    case "wash_completed":
      return (
        <>
          清洗批次 {event.batchId} · 残留{resultText(event.residuePass)} · 湿度
          {resultText(event.humidityPass)} → {event.accepted ? "回可用区" : "留待洗区返洗"}
        </>
      );
    case "released":
      return (
        <>
          批次 {event.batchId} 释放（{event.releaseReason}）→{" "}
          {event.routedTo === "available" ? "回可用区" : "停待洗区"}
        </>
      );
    case "corrected":
      return (
        <>
          更正 #{event.refSeq}：残留 {resultText(event.oldResult.residuePass)}/
          {resultText(event.oldResult.humidityPass)} → {resultText(event.newResult.residuePass)}/
          {resultText(event.newResult.humidityPass)}；原因：{event.correctReason}
        </>
      );
    case "blocked":
      return (
        <>
          「{event.blockedAction}」被拦截：{event.blockedReasons.join("；")}
        </>
      );
    default:
      return null;
  }
}

function CorrectForm({ event, onDone }: { event: Extract<ArchiveEvent, { kind: "wash_completed" }>; onDone: () => void }) {
  const { dispatch } = useTurnover();
  const [residue, setResidue] = useState<boolean | null>(null);
  const [humidity, setHumidity] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const canSubmit = residue !== null && humidity !== null && reason.trim() !== "";

  return (
    <form
      className="correct-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || residue === null || humidity === null) return;
        dispatch({
          type: "correctWash",
          id: event.carrierId,
          refSeq: event.seq,
          residuePass: residue,
          humidityPass: humidity,
          reason,
        });
        setResidue(null);
        setHumidity(null);
        setReason("");
        onDone();
      }}
    >
      <div className="check-row">
        <span>残留检测</span>
        <label className="radio-pill">
          <input type="radio" name={`c-res-${event.seq}`} checked={residue === true} onChange={() => setResidue(true)} />
          合格
        </label>
        <label className="radio-pill">
          <input type="radio" name={`c-res-${event.seq}`} checked={residue === false} onChange={() => setResidue(false)} />
          不合格
        </label>
      </div>
      <div className="check-row">
        <span>湿度复测</span>
        <label className="radio-pill">
          <input type="radio" name={`c-hum-${event.seq}`} checked={humidity === true} onChange={() => setHumidity(true)} />
          合格
        </label>
        <label className="radio-pill">
          <input type="radio" name={`c-hum-${event.seq}`} checked={humidity === false} onChange={() => setHumidity(false)} />
          不合格
        </label>
      </div>
      <input value={reason} placeholder="更正原因（必填，旧结果保留不覆盖）" onChange={(e) => setReason(e.target.value)} />
      <div className="card-actions">
        <button className="primary-action" type="submit" disabled={!canSubmit}>
          提交更正
        </button>
        <button type="button" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

function EventRow({ event }: { event: ArchiveEvent }) {
  const { state } = useTurnover();
  const [showCorrect, setShowCorrect] = useState(false);
  const corrections =
    event.kind === "wash_completed" ? correctionCount(state.events, event.seq) : 0;
  const latestWash = latestWashCompleted(state.events, event.carrierId);
  const canCorrect = event.kind === "wash_completed" && latestWash?.seq === event.seq;

  return (
    <article className={`event-row event-${event.kind}`}>
      <div className="event-main">
        <div className="event-top">
          <span className="event-seq">#{event.seq}</span>
          <span className={`event-kind kind-${event.kind}`}>{ARCHIVE_KIND_LABELS[event.kind]}</span>
          <span className="event-carrier">{event.carrierId}</span>
          <time>{formatDateTime(event.at)}</time>
          {corrections > 0 && <span className="badge badge-corrected">已更正 {corrections} 次</span>}
        </div>
        <p>
          <EventDetail event={event} />
        </p>
      </div>
      {canCorrect && !showCorrect && (
        <button className="link-button" onClick={() => setShowCorrect(true)}>
          更正结果
        </button>
      )}
      {showCorrect && event.kind === "wash_completed" && (
        <CorrectForm event={event} onDone={() => setShowCorrect(false)} />
      )}
    </article>
  );
}

export function ArchivePanel() {
  const { state } = useTurnover();
  const [filter, setFilter] = useState<string>("");
  const events = [...state.events]
    .reverse()
    .filter((e) => (filter ? e.carrierId === filter : true));

  return (
    <section className="panel archive-panel">
      <div className="section-heading">
        <div>
          <p>留档（只追加，不可覆盖）</p>
          <h2>周转事件流水</h2>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部载具</option>
          {state.carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </div>
      <div className="event-list">
        {events.map((event) => (
          <EventRow key={event.seq} event={event} />
        ))}
      </div>
    </section>
  );
}
