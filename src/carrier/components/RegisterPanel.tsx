import { useState } from "react";
import { useTurnover } from "../store";
import { CARRIER_GRADES, type CarrierGrade } from "../types";
import { formatDateTimeLocal } from "../time";

const DEFAULT_CYCLE: Record<CarrierGrade, number> = {
  "ISO 5": 24,
  "ISO 6": 12,
  "ISO 7": 16,
};

export function RegisterPanel() {
  const { state, dispatch } = useTurnover();
  const [id, setId] = useState("");
  const [grade, setGrade] = useState<CarrierGrade>("ISO 5");
  const [cycle, setCycle] = useState(DEFAULT_CYCLE["ISO 5"]);
  const [cleanedAt, setCleanedAt] = useState(() => formatDateTimeLocal(Date.now()));
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = id.trim().toUpperCase();
    if (!normalized) {
      setError("请填写载具编号");
      return;
    }
    if (state.carriers.some((c) => c.id === normalized)) {
      setError("载具编号已登记，不能重复建档");
      return;
    }
    const ts = new Date(cleanedAt).getTime();
    if (Number.isNaN(ts)) {
      setError("上次清洗时刻格式不正确");
      return;
    }
    dispatch({
      type: "register",
      id: normalized,
      grade,
      lastCleanedAt: ts,
      washCycleHours: cycle,
    });
    setId("");
    setError("");
  }

  return (
    <section className="panel register-panel">
      <div className="section-heading">
        <div>
          <p>载具资料登记</p>
          <h2>新载具建档</h2>
        </div>
      </div>
      <form className="register-grid" onSubmit={submit}>
        <label>
          <span>载具编号</span>
          <input value={id} placeholder="如 C-207" onChange={(e) => setId(e.target.value)} />
        </label>
        <label>
          <span>洁净等级</span>
          <select
            value={grade}
            onChange={(e) => {
              const g = e.target.value as CarrierGrade;
              setGrade(g);
              setCycle(DEFAULT_CYCLE[g]);
            }}
          >
            {CARRIER_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>清洗周期（小时）</span>
          <input
            type="number"
            min={1}
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value))}
          />
        </label>
        <label>
          <span>上次合格清洗时刻</span>
          <input type="datetime-local" value={cleanedAt} onChange={(e) => setCleanedAt(e.target.value)} />
        </label>
        <div className="register-submit">
          <button className="primary-action" type="submit">
            登记载具
          </button>
          {error && <span className="text-danger">{error}</span>}
        </div>
      </form>
    </section>
  );
}
