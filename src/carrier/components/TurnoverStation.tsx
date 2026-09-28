import { effectiveZone } from "../admission";
import { useTurnover } from "../store";
import { RegisterPanel } from "./RegisterPanel";
import { TurnoverBoard } from "./TurnoverBoard";
import { ArchivePanel } from "./ArchivePanel";

function MetricCard({ label, value, hint, barClass }: { label: string; value: number; hint: string; barClass: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="metric-hint">{hint}</p>
      <i className={barClass} />
    </article>
  );
}

export function TurnoverStation() {
  const { state, dispatch, now } = useTurnover();

  const counts = {
    available: 0,
    in_use: 0,
    wash_pending: 0,
    washing: 0,
  };
  for (const c of state.carriers) {
    counts[effectiveZone(c, now)] += 1;
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · 换线周转台 · port 5109</p>
          <h1>晶圆载具周转台</h1>
          <p className="subtitle">
            载具登记编号、等级与清洗周期；未卸片不得再次分配；清洗过期停待洗区；洗完批次、残留检测、
            湿度复测两项合格才回可用区。所有退回、拦截与更正均留档追溯。
          </p>
        </div>
        <div className="stack-card">
          <span>载具资料 · 准入判断 · 留档</span>
          <strong>三层分离，规则集中在准入模块，留档只追加不改写</strong>
          <button onClick={() => dispatch({ type: "reset" })}>恢复演示数据</button>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="可用区" value={counts.available} hint="清洗有效、已卸片，可分配" barClass="status-ok" />
        <MetricCard label="周转中" value={counts.in_use} hint="装片或绑批，未卸片锁定" barClass="status-busy" />
        <MetricCard label="待洗区" value={counts.wash_pending} hint="过期或检测不合格，停区" barClass="status-danger" />
        <MetricCard label="清洗中" value={counts.washing} hint="等待两项检测录入" barClass="status-watch" />
      </section>

      <RegisterPanel />
      <TurnoverBoard />
      <ArchivePanel />
    </main>
  );
}
