import { useState } from "react";
import type { Carrier, Zone } from "../carrier/types";
import {
  canRecordWash,
  cleaningDeadline,
  effectiveResult,
  FIELD_LABEL,
  getZone,
  isCleaningExpired,
  lastQualifiedCleanAt,
  RESULT_LABEL,
  washPassed,
} from "../carrier/eligibility";
import { formatDateTime, formatGap } from "../carrier/time";
import type { ModalKind } from "./Modals";

interface CardProps {
  carrier: Carrier;
  now: number;
  onAction: (kind: ModalKind, carrier: Carrier) => void;
}

export function CarrierCard({ carrier, now, onAction }: CardProps) {
  const [open, setOpen] = useState(false);
  const zone: Zone = getZone(carrier, now);
  const expired = isCleaningExpired(carrier, now);
  const deadline = cleaningDeadline(carrier);
  const baseline = lastQualifiedCleanAt(carrier);
  const isRegisteredBaseline =
    carrier.washRecords.find((r) => washPassed(r)) === undefined;

  return (
    <article className={`carrier-card zone-border-${zone.toLowerCase()}`}>
      <header className="carrier-head">
        <div>
          <h4>{carrier.id}</h4>
          <span className="grade-pill">{carrier.grade}</span>
        </div>
        <span className={`zone-badge zone-${zone.toLowerCase()}`}>
          {zone === "AVAILABLE" ? "可用区" : zone === "IN_USE" ? "周转中" : "待洗区"}
        </span>
      </header>

      <dl className="carrier-meta">
        <div>
          <dt>上次清洗</dt>
          <dd>
            {formatDateTime(baseline)}
            {isRegisteredBaseline ? "（登记值）" : "（双检合格）"}
          </dd>
        </div>
        <div>
          <dt>清洗周期 / 截止</dt>
          <dd>
            {carrier.cycleHours}h ·{" "}
            <span className={expired ? "text-danger" : "text-ok"}>
              {formatGap(deadline, now)}
            </span>
          </dd>
        </div>
        <div>
          <dt>当前批次</dt>
          <dd>
            {carrier.batchId ? (
              <span className="batch-tag">{carrier.batchId}（未卸片）</span>
            ) : (
              <span className="muted">— 未装载 —</span>
            )}
          </dd>
        </div>
      </dl>

      {zone === "IN_USE" && (
        <p className="block-note">⛔ 装着上一批硅片，未卸片前不能再次分配</p>
      )}
      {zone === "WASH_PENDING" && (
        <p className="block-note warn">
          {carrier.washRecords.length > 0 && !washPassed(carrier.washRecords[0])
            ? "最近一次清洗未双检合格，停留待洗区，需重洗"
            : "⛔ 清洗周期已过，停用待洗"}
        </p>
      )}

      <div className="carrier-actions">
        {zone === "AVAILABLE" && (
          <button className="primary-action" onClick={() => onAction("allocate", carrier)}>
            分配批次
          </button>
        )}
        {zone === "IN_USE" && (
          <>
            <button className="primary-action" onClick={() => onAction("unload", carrier)}>
              卸片
            </button>
            <button onClick={() => onAction("release", carrier)}>退回/取消</button>
          </>
        )}
        {zone === "WASH_PENDING" && (
          <button
            className="primary-action"
            disabled={!canRecordWash(carrier, now) || Boolean(carrier.batchId)}
            onClick={() => onAction("wash", carrier)}
            title={
              carrier.batchId
                ? "需先卸片再清洗"
                : canRecordWash(carrier, now)
                ? "登记残留检测与湿度复测"
                : "仅待洗区可登记"
            }
          >
            登记清洗结果
          </button>
        )}
        {carrier.washRecords.length > 0 && (
          <button onClick={() => onAction("correct", carrier)}>结果更正</button>
        )}
        <button className="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "收起记录" : `清洗记录 (${carrier.washRecords.length})`}
        </button>
      </div>

      {open && <WashHistory carrier={carrier} />}
    </article>
  );
}

function WashHistory({ carrier }: { carrier: Carrier }) {
  if (carrier.washRecords.length === 0) {
    return <p className="muted small">暂无清洗记录。</p>;
  }
  return (
    <div className="wash-history">
      {carrier.washRecords.map((r) => {
        const passed = washPassed(r);
        return (
          <div key={r.id} className={`wash-row ${passed ? "pass" : "fail"}`}>
            <div className="wash-row-head">
              <strong>{r.id}</strong>
              <span>{r.batchId}</span>
              <span>{formatDateTime(r.completedAt)}</span>
              <span className={`check-tag ${passed ? "ok" : "ng"}`}>
                {passed ? "双检合格 · 已回可用区" : "未通过 · 停留待洗"}
              </span>
            </div>
            <ul className="check-list">
              {(["residual", "humidity"] as const).map((field) => {
                const value = effectiveResult(r, field);
                const corrected = r.corrections.some((c) => c.field === field);
                return (
                  <li key={field}>
                    {FIELD_LABEL[field]}：
                    <span className={value === "pass" ? "text-ok" : "text-danger"}>
                      {RESULT_LABEL[value]}
                    </span>
                    {corrected && <em className="corrected-flag">（经更正，原值已留档）</em>}
                    <span className="muted"> · {r[field].measured || "未填实测值"}</span>
                  </li>
                );
              })}
            </ul>
            {r.corrections.length > 0 && (
              <ul className="correction-list">
                {r.corrections.map((c) => (
                  <li key={c.id}>
                    <span className="corr-badge">更正 {c.id}</span>
                    {FIELD_LABEL[c.field]} {RESULT_LABEL[c.oldValue]} →{" "}
                    <strong>{RESULT_LABEL[c.newValue]}</strong>
                    <span className="muted">
                      {" "}
                      · {c.operator} · {formatDateTime(c.at)}
                    </span>
                    <p className="corr-reason">原因：{c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">操作人：{r.operator}</p>
          </div>
        );
      })}
    </div>
  );
}
