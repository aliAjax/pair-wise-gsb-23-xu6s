import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { useTurnoverStore, summarize } from "./carrier/store";
import {
  ZONE_META,
  ZONE_ORDER,
  getZone,
} from "./carrier/eligibility";
import { GRADES } from "./carrier/registry";
import type { Carrier, Grade, Zone } from "./carrier/types";
import { formatDateTime } from "./carrier/time";
import { CarrierCard } from "./components/CarrierCard";
import { ArchivePanel } from "./components/ArchivePanel";
import { ActionModal, type ModalKind } from "./components/Modals";

const project = {
  id: "hxwl-09",
  port: 5109,
  title: "晶圆载具周转台",
  subtitle:
    "换线看板：载具按编号登记、未卸片拦截再分配；超期停待洗区，残留检测与湿度复测双合格才回可用区",
  stack: "React + Vite + TypeScript + CSS",
  users: ["巡检员", "厂务工程师", "班组长"],
};

type GradeFilter = Grade | "ALL";

function App() {
  const store = useTurnoverStore();
  const [now, setNow] = useState(() => Date.now());
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("ALL");
  const [modal, setModal] = useState<{ kind: ModalKind; carrier?: Carrier } | null>(
    null
  );

  // 周期倒计时与过期判区需要随时间刷新
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const stats = useMemo(() => summarize(store.carriers, now), [store.carriers, now]);

  const visibleCarriers = useMemo(
    () =>
      gradeFilter === "ALL"
        ? store.carriers
        : store.carriers.filter((c) => c.grade === gradeFilter),
    [store.carriers, gradeFilter]
  );

  const grouped = useMemo(() => {
    const map: Record<Zone, Carrier[]> = {
      AVAILABLE: [],
      IN_USE: [],
      WASH_PENDING: [],
    };
    for (const c of visibleCarriers) map[getZone(c, now)].push(c);
    return map;
  }, [visibleCarriers, now]);

  const metricDefs = [
    {
      label: "可用区载具",
      value: stats.zones.AVAILABLE,
      bar: "status-ok",
    },
    {
      label: "周转中 · 未卸片",
      value: stats.zones.IN_USE,
      bar: "status-watch",
    },
    {
      label: "待洗区（过期/未过检）",
      value: stats.zones.WASH_PENDING,
      bar: "status-danger",
    },
    {
      label: "分配拦截总数",
      value: stats.blockedAllocate,
      bar: "status-danger",
    },
  ];

  const openAction = (kind: ModalKind, carrier?: Carrier) =>
    setModal({ kind, carrier });

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
          <div className="operator-bar">
            <label className="operator-select">
              <span>当前操作人</span>
              <select
                value={store.operator}
                onChange={(e) => store.setOperator(e.target.value)}
              >
                {project.users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <span className="clock">当前时刻 {formatDateTime(now)}</span>
            <button className="ghost" onClick={store.resetDemo}>
              重置演示数据
            </button>
          </div>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <span className="muted small">
            资料（registry）/ 准入（eligibility）/ 留档（archive）三层分离，
            留档只追加不覆盖
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        {metricDefs.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.bar} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((u) => (
              <span key={u} className={u === store.operator ? "chip-active" : ""}>
                {u}
              </span>
            ))}
          </div>

          <h2>等级筛选</h2>
          <div className="chips muted">
            <button
              className={gradeFilter === "ALL" ? "chip-btn-active" : ""}
              onClick={() => setGradeFilter("ALL")}
            >
              全部
            </button>
            {GRADES.map((g) => (
              <button
                key={g}
                className={gradeFilter === g ? "chip-btn-active" : ""}
                onClick={() => setGradeFilter(g)}
              >
                {g}
              </button>
            ))}
          </div>

          <h2>周转规则</h2>
          <ul className="rule-list">
            <li>载具登记编号、等级、上次清洗时刻与批次；未卸片前禁止再次分配。</li>
            <li>清洗周期一过即停待洗区，换线不自动放行。</li>
            <li>洗完登记批次、残留检测与湿度复测，两项同时合格才回可用区。</li>
            <li>批次退回或取消：释放载具并留记录；过期则转待洗区。</li>
            <li>检测更正另写原因、保留原值，准入按最新更正结论判定。</li>
          </ul>

          <button
            className="primary-action full-width"
            onClick={() => openAction("register")}
          >
            ＋ 登记新载具
          </button>
        </aside>

        <section className="panel board-panel">
          <div className="section-heading">
            <div>
              <p>周转台</p>
              <h2>分区看板（三区物理隔离）</h2>
            </div>
            <button className="primary-action" onClick={() => openAction("allocate")}>
              分配载具给批次
            </button>
          </div>

          <div className="zone-grid">
            {ZONE_ORDER.map((zone) => (
              <div key={zone} className={`zone-column zone-col-${zone.toLowerCase()}`}>
                <header className="zone-header">
                  <span className={`zone-dot ${ZONE_META[zone].dot}`} />
                  <div>
                    <h3>
                      {ZONE_META[zone].label}
                      <em>{grouped[zone].length}</em>
                    </h3>
                    <p>{ZONE_META[zone].hint}</p>
                  </div>
                </header>
                <div className="zone-cards">
                  {grouped[zone].map((c) => (
                    <CarrierCard
                      key={c.id}
                      carrier={c}
                      now={now}
                      onAction={openAction}
                    />
                  ))}
                  {grouped[zone].length === 0 && (
                    <p className="zone-empty">当前筛选下暂无载具</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <ArchivePanel events={store.events} />

      {modal && (
        <ActionModal
          kind={modal.kind}
          carrier={modal.carrier}
          carriers={store.carriers}
          now={now}
          operator={store.operator}
          onClose={() => setModal(null)}
          onRegister={store.registerCarrier}
          onAllocate={store.allocate}
          onUnload={store.unload}
          onWash={store.recordWash}
          onRelease={store.release}
          onCorrect={store.correctWash}
        />
      )}
    </main>
  );
}

export default App;
