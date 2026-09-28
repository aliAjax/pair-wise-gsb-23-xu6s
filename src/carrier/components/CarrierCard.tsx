import { useState } from "react";
import { effectiveZone, holdReason, isWashExpired } from "../admission";
import { useTurnover } from "../store";
import type { Carrier } from "../types";
import { formatCountdown, formatDateTime, remainingWashMs } from "../time";

function TestBadge({ label, value }: { label: string; value: boolean | null }) {
  const cls = value === null ? "badge badge-none" : value ? "badge badge-pass" : "badge badge-fail";
  const text = value === null ? "未检" : value ? `${label}合格` : `${label}不合格`;
  return <span className={cls}>{text}</span>;
}

function AssignForm({ carrier }: { carrier: Carrier }) {
  const { dispatch } = useTurnover();
  const [batch, setBatch] = useState("");
  return (
    <form
      className="card-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!batch.trim()) return;
        dispatch({ type: "assign", id: carrier.id, batchId: batch });
        setBatch("");
      }}
    >
      <input
        value={batch}
        placeholder="分配生产批次号"
        onChange={(e) => setBatch(e.target.value)}
      />
      <button className="primary-action" type="submit">
        分配
      </button>
    </form>
  );
}

function InUseActions({ carrier }: { carrier: Carrier }) {
  const { dispatch } = useTurnover();
  const [reason, setReason] = useState("");
  const [showRelease, setShowRelease] = useState(false);
  return (
    <div className="card-actions">
      <button className="primary-action" onClick={() => dispatch({ type: "unload", id: carrier.id })}>
        确认卸片
      </button>
      {!showRelease ? (
        <button onClick={() => setShowRelease(true)}>退回 / 取消批次</button>
      ) : (
        <form
          className="card-form inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            dispatch({ type: "release", id: carrier.id, reason });
            setReason("");
            setShowRelease(false);
          }}
        >
          <input
            value={reason}
            placeholder="退回/取消原因（必填）"
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="danger-action" type="submit">
            释放载具
          </button>
          <button type="button" onClick={() => setShowRelease(false)}>
            收起
          </button>
        </form>
      )}
    </div>
  );
}

function WashForm({ carrier }: { carrier: Carrier }) {
  const { dispatch } = useTurnover();
  const [batch, setBatch] = useState("");
  const [residue, setResidue] = useState<boolean | null>(null);
  const [humidity, setHumidity] = useState<boolean | null>(null);
  const canSubmit = batch.trim() !== "" && residue !== null && humidity !== null;
  return (
    <form
      className="wash-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || residue === null || humidity === null) return;
        dispatch({ type: "completeWash", id: carrier.id, batchId: batch, residuePass: residue, humidityPass: humidity });
        setBatch("");
        setResidue(null);
        setHumidity(null);
      }}
    >
      <input value={batch} placeholder="清洗批次号（必填）" onChange={(e) => setBatch(e.target.value)} />
      <div className="check-row">
        <span>残留检测</span>
        <label className="radio-pill">
          <input type="radio" name={`res-${carrier.id}`} checked={residue === true} onChange={() => setResidue(true)} />
          合格
        </label>
        <label className="radio-pill">
          <input type="radio" name={`res-${carrier.id}`} checked={residue === false} onChange={() => setResidue(false)} />
          不合格
        </label>
      </div>
      <div className="check-row">
        <span>湿度复测</span>
        <label className="radio-pill">
          <input type="radio" name={`hum-${carrier.id}`} checked={humidity === true} onChange={() => setHumidity(true)} />
          合格
        </label>
        <label className="radio-pill">
          <input type="radio" name={`hum-${carrier.id}`} checked={humidity === false} onChange={() => setHumidity(false)} />
          不合格
        </label>
      </div>
      <p className="form-hint">两项均合格才回可用区，任一不合格留在待洗区返洗</p>
      <button className="primary-action" type="submit" disabled={!canSubmit}>
        记录清洗结果
      </button>
    </form>
  );
}

export function CarrierCard({ carrier }: { carrier: Carrier }) {
  const { now, dispatch } = useTurnover();
  const zone = effectiveZone(carrier, now);
  const expired = isWashExpired(carrier, now);
  const held = zone === "wash_pending";

  return (
    <article className={`carrier-card zone-${zone} ${carrier.wafersLoaded ? "loaded" : ""}`}>
      <header className="carrier-head">
        <div>
          <h3>{carrier.id}</h3>
          <span className="grade-tag">{carrier.grade}</span>
        </div>
        {carrier.wafersLoaded && <span className="badge badge-warn">装片中</span>}
      </header>

      <dl className="carrier-meta">
        <div>
          <dt>上次清洗</dt>
          <dd>{formatDateTime(carrier.lastCleanedAt)}</dd>
        </div>
        <div>
          <dt>清洗时限</dt>
          <dd className={expired ? "text-danger" : ""}>
            {formatCountdown(remainingWashMs(carrier, now))}
          </dd>
        </div>
        <div>
          <dt>清洗批次</dt>
          <dd>{carrier.lastWashBatchId ?? "—"}</dd>
        </div>
        <div>
          <dt>当前批次</dt>
          <dd>{carrier.batchId ?? "空载"}</dd>
        </div>
      </dl>

      <div className="badge-row">
        <TestBadge label="残留" value={carrier.residuePass} />
        <TestBadge label="湿度" value={carrier.humidityPass} />
        {held && <span className="badge badge-held">{holdReason(carrier, now)}</span>}
      </div>

      {zone === "available" && <AssignForm carrier={carrier} />}
      {zone === "in_use" && <InUseActions carrier={carrier} />}
      {zone === "wash_pending" && (
        <button className="primary-action" onClick={() => dispatch({ type: "startWash", id: carrier.id })}>
          送入清洗
        </button>
      )}
      {zone === "washing" && <WashForm carrier={carrier} />}
    </article>
  );
}
