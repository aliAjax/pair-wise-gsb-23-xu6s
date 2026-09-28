import { useEffect, useState, type ReactNode } from "react";
import type { Carrier, CheckField, Grade, ReleaseKind, TestResult } from "../carrier/types";
import { GRADES, DEFAULT_CYCLE_HOURS } from "../carrier/registry";
import {
  allocateCheck,
  FIELD_LABEL,
  getZone,
  RESULT_LABEL,
  ZONE_META,
} from "../carrier/eligibility";
import type { ActionResult, CorrectInput, WashInput } from "../carrier/store";
import { toLocalInput } from "../carrier/time";

export type ModalKind =
  | "register"
  | "allocate"
  | "unload"
  | "wash"
  | "release"
  | "correct";

interface ModalProps {
  kind: ModalKind;
  carrier?: Carrier;
  carriers: Carrier[];
  now: number;
  operator: string;
  onClose: () => void;
  onRegister: (input: {
    id: string;
    grade: Grade;
    cycleHours: number;
    lastCleanedAt: number;
  }) => ActionResult;
  onAllocate: (carrierId: string, batchId: string) => ActionResult;
  onUnload: (carrierId: string, note: string) => ActionResult;
  onWash: (carrierId: string, input: WashInput) => ActionResult;
  onRelease: (carrierId: string, kind: ReleaseKind, note: string) => ActionResult;
  onCorrect: (carrierId: string, input: CorrectInput) => ActionResult;
}

function Shell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResultLine({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="form-error">⚠ {text}</p>;
}

export function ActionModal(props: ModalProps) {
  const { kind, carrier, carriers, now, onClose } = props;
  const [error, setError] = useState<string>();

  useEffect(() => setError(undefined), [kind, carrier?.id]);

  const finish = (res: ActionResult) => {
    if (res.ok) onClose();
    else setError(res.error);
  };

  if (kind === "register") return <RegisterModal {...props} error={error} finish={finish} />;
  if (kind === "allocate")
    return <AllocateModal {...props} error={error} finish={finish} />;
  if (!carrier) return null;

  if (kind === "unload")
    return (
      <Shell title={`卸片 · ${carrier.id}`} onClose={onClose}>
        <UnloadForm carrier={carrier} onSubmit={(note) => finish(props.onUnload(carrier.id, note))}>
          <ResultLine text={error} />
        </UnloadForm>
      </Shell>
    );

  if (kind === "wash")
    return (
      <Shell title={`清洗结果登记 · ${carrier.id}`} onClose={onClose}>
        <WashForm
          carrier={carrier}
          now={now}
          operator={props.operator}
          onSubmit={(input) => finish(props.onWash(carrier.id, input))}
        >
          <ResultLine text={error} />
        </WashForm>
      </Shell>
    );

  if (kind === "release")
    return (
      <Shell title={`退回 / 取消批次 · ${carrier.id}`} onClose={onClose}>
        <ReleaseForm
          carrier={carrier}
          onSubmit={(k, note) => finish(props.onRelease(carrier.id, k, note))}
        >
          <ResultLine text={error} />
        </ReleaseForm>
      </Shell>
    );

  if (kind === "correct")
    return (
      <Shell title={`检测结果更正 · ${carrier.id}`} onClose={onClose}>
        <CorrectForm
          carrier={carrier}
          onSubmit={(input) => finish(props.onCorrect(carrier.id, input))}
        >
          <ResultLine text={error} />
        </CorrectForm>
      </Shell>
    );

  return null;
}

function RegisterModal({
  error,
  finish,
  onRegister,
  now,
}: ModalProps & {
  error?: string;
  finish: (r: ActionResult) => void;
}) {
  const [id, setId] = useState("");
  const [grade, setGrade] = useState<Grade>("ISO 5");
  const [cycleHours, setCycleHours] = useState(DEFAULT_CYCLE_HOURS);
  const [lastCleanedAt, setLastCleanedAt] = useState(toLocalInput(now));

  return (
    <Shell title="新载具登记" onClose={() => finish({ ok: true })}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          finish(
            onRegister({
              id,
              grade,
              cycleHours: Number(cycleHours),
              lastCleanedAt: new Date(lastCleanedAt).getTime(),
            })
          );
        }}
      >
        <label>
          <span>载具编号 *</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="如 FOUP-5501"
            autoFocus
          />
        </label>
        <div className="form-row">
          <label>
            <span>洁净等级 *</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>清洗周期（小时）*</span>
            <input
              type="number"
              min={1}
              value={cycleHours}
              onChange={(e) => setCycleHours(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          <span>上次清洗时刻 *</span>
          <input
            type="datetime-local"
            value={lastCleanedAt}
            onChange={(e) => setLastCleanedAt(e.target.value)}
          />
        </label>
        <p className="form-hint">登记后按“未装载批次 + 清洗在周期内”进入可用区；超期则直接停入待洗区。</p>
        <ResultLine text={error} />
        <div className="modal-actions">
          <button type="button" onClick={() => finish({ ok: true })}>
            取消
          </button>
          <button type="submit" className="primary-action">
            登记入册
          </button>
        </div>
      </form>
    </Shell>
  );
}

function AllocateModal({
  carriers,
  now,
  error,
  finish,
  onAllocate,
}: ModalProps & {
  error?: string;
  finish: (r: ActionResult) => void;
}) {
  const [carrierId, setCarrierId] = useState("");
  const [batchId, setBatchId] = useState("");

  const selected = carriers.find((c) => c.id === carrierId);
  const check = selected ? allocateCheck(selected, now) : undefined;

  return (
    <Shell title="分配载具给批次" onClose={() => finish({ ok: true })}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!carrierId) return;
          finish(onAllocate(carrierId, batchId));
        }}
      >
        <label>
          <span>选择载具 *</span>
          <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} autoFocus>
            <option value="">— 请选择 —</option>
            {carriers.map((c) => {
              const r = allocateCheck(c, now);
              return (
                <option key={c.id} value={c.id} disabled={!r.ok}>
                  {c.id} · {c.grade} ·{" "}
                  {r.ok ? ZONE_META[getZone(c, now)].label : `不可分配：${r.reason}`}
                </option>
              );
            })}
          </select>
        </label>
        {selected && check && (
          <p className={check.ok ? "form-hint ok" : "form-error"}>
            {check.ok
              ? `✓ ${selected.id} 当前在可用区，可分配`
              : `✗ ${check.reason}`}
          </p>
        )}
        <label>
          <span>目标批次号 *</span>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="如 LOT-260922-K08"
          />
        </label>
        <ResultLine text={error} />
        <div className="modal-actions">
          <button type="button" onClick={() => finish({ ok: true })}>
            取消
          </button>
          <button type="submit" className="primary-action" disabled={!carrierId || !check?.ok}>
            确认分配
          </button>
        </div>
      </form>
    </Shell>
  );
}

function UnloadForm({
  carrier,
  onSubmit,
  children,
}: {
  carrier: Carrier;
  onSubmit: (note: string) => void;
  children?: ReactNode;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note);
      }}
    >
      <p className="form-hint">
        当前装载批次：<strong>{carrier.batchId}</strong>。卸片后若清洗已过期，载具自动转入待洗区。
      </p>
      <label>
        <span>卸片备注</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如 硅片已全数转下工序，目检无残留"
        />
      </label>
      {children}
      <div className="modal-actions">
        <button type="submit" className="primary-action">
          确认卸片
        </button>
      </div>
    </form>
  );
}

function ResultToggle({
  value,
  onChange,
}: {
  value: TestResult;
  onChange: (v: TestResult) => void;
}) {
  return (
    <div className="seg">
      <button
        type="button"
        className={value === "pass" ? "seg-on pass" : ""}
        onClick={() => onChange("pass")}
      >
        合格
      </button>
      <button
        type="button"
        className={value === "fail" ? "seg-on fail" : ""}
        onClick={() => onChange("fail")}
      >
        不合格
      </button>
    </div>
  );
}

function WashForm({
  carrier,
  now,
  operator,
  onSubmit,
  children,
}: {
  carrier: Carrier;
  now: number;
  operator: string;
  onSubmit: (input: WashInput) => void;
  children?: ReactNode;
}) {
  const [batchId, setBatchId] = useState(carrier.batchId ?? "");
  const [residual, setResidual] = useState<TestResult>("pass");
  const [humidity, setHumidity] = useState<TestResult>("pass");
  const [residualMeasured, setResidualMeasured] = useState("");
  const [humidityMeasured, setHumidityMeasured] = useState("");
  const [completedAt, setCompletedAt] = useState(toLocalInput(now));

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          batchId,
          residual,
          residualMeasured,
          humidity,
          humidityMeasured,
          operator,
          completedAt: new Date(completedAt).getTime(),
        });
      }}
    >
      <label>
        <span>清洗对应批次 *</span>
        <input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="如 LOT-260920-A07" />
      </label>
      <div className="form-row">
        <label>
          <span>残留检测结论 *</span>
          <ResultToggle value={residual} onChange={setResidual} />
        </label>
        <label>
          <span>残留实测值</span>
          <input
            value={residualMeasured}
            onChange={(e) => setResidualMeasured(e.target.value)}
            placeholder="如 离子残留 0.02 µg/cm²"
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>湿度复测结论 *</span>
          <ResultToggle value={humidity} onChange={setHumidity} />
        </label>
        <label>
          <span>湿度实测值</span>
          <input
            value={humidityMeasured}
            onChange={(e) => setHumidityMeasured(e.target.value)}
            placeholder="如 相对湿度 40%RH（限值 ≤45%RH）"
          />
        </label>
      </div>
      <label>
        <span>清洗完成时刻 *</span>
        <input
          type="datetime-local"
          value={completedAt}
          onChange={(e) => setCompletedAt(e.target.value)}
        />
      </label>
      <p className={`form-hint ${residual === "pass" && humidity === "pass" ? "ok" : "warn"}`}>
        {residual === "pass" && humidity === "pass"
          ? "✓ 两项均合格，提交后载具回可用区，清洗周期重新起算"
          : "✗ 任一项不合格，载具继续停在待洗区，需重洗后重新登记"}
      </p>
      {children}
      <div className="modal-actions">
        <button type="submit" className="primary-action">
          提交清洗记录
        </button>
      </div>
    </form>
  );
}

function ReleaseForm({
  carrier,
  onSubmit,
  children,
}: {
  carrier: Carrier;
  onSubmit: (kind: ReleaseKind, note: string) => void;
  children?: ReactNode;
}) {
  const [kind, setKind] = useState<ReleaseKind>("return");
  const [note, setNote] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(kind, note);
      }}
    >
      <p className="form-hint">
        当前装载批次：<strong>{carrier.batchId}</strong>。释放后载具与批次解绑并留下记录。
      </p>
      <div className="seg">
        <button
          type="button"
          className={kind === "return" ? "seg-on pass" : ""}
          onClick={() => setKind("return")}
        >
          批次退回
        </button>
        <button
          type="button"
          className={kind === "cancel" ? "seg-on fail" : ""}
          onClick={() => setKind("cancel")}
        >
          批次取消
        </button>
      </div>
      <label>
        <span>{kind === "return" ? "退回说明 *" : "取消原因 *"}</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === "return" ? "如 整批退回前道，载具目检完好" : "如 工艺参数异常，批次取消未投产"}
        />
      </label>
      {children}
      <div className="modal-actions">
        <button type="submit" className="primary-action">
          释放载具
        </button>
      </div>
    </form>
  );
}

function CorrectForm({
  carrier,
  onSubmit,
  children,
}: {
  carrier: Carrier;
  onSubmit: (input: CorrectInput) => void;
  children?: ReactNode;
}) {
  const options = carrier.washRecords;
  const [washId, setWashId] = useState(options[0]?.id ?? "");
  const [field, setField] = useState<CheckField>("residual");
  const [newValue, setNewValue] = useState<TestResult>("fail");
  const [reason, setReason] = useState("");

  const record = options.find((r) => r.id === washId);
  const current: TestResult | undefined = record
    ? (() => {
        const list = record.corrections.filter((c) => c.field === field);
        return list.length ? list[list.length - 1].newValue : record[field].result;
      })()
    : undefined;

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ washId, field, newValue, reason });
      }}
    >
      {options.length === 0 ? (
        <p className="form-error">该载具还没有清洗记录，无可更正对象。</p>
      ) : (
        <>
          <label>
            <span>选择清洗记录 *</span>
            <select value={washId} onChange={(e) => setWashId(e.target.value)}>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.batchId} · 残留{RESULT_LABEL[r.residual.result]} / 湿度
                  {RESULT_LABEL[r.humidity.result]}
                  {r.corrections.length ? ` · 已更正 ${r.corrections.length} 次` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              <span>更正项目 *</span>
              <select value={field} onChange={(e) => setField(e.target.value as CheckField)}>
                <option value="residual">{FIELD_LABEL.residual}</option>
                <option value="humidity">{FIELD_LABEL.humidity}</option>
              </select>
            </label>
            <label>
              <span>更正后结论 *</span>
              <select value={newValue} onChange={(e) => setNewValue(e.target.value as TestResult)}>
                <option value="pass">合格</option>
                <option value="fail">不合格</option>
              </select>
            </label>
          </div>
          {current && (
            <p className={`form-hint ${newValue === current ? "warn" : "ok"}`}>
              现行值：<strong>{RESULT_LABEL[current]}</strong> → 更正为：
              <strong>{RESULT_LABEL[newValue]}</strong>
              。原始结论不覆盖，更正条目另行留档。
            </p>
          )}
          <label>
            <span>更正原因 *</span>
            <textarea
              className="textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如 留样复测确认为采样污染，附复检单号 RV-2609-018"
            />
          </label>
        </>
      )}
      {children}
      <div className="modal-actions">
        <button
          type="submit"
          className="primary-action"
          disabled={!record || newValue === current}
        >
          提交更正（保留旧值）
        </button>
      </div>
    </form>
  );
}
