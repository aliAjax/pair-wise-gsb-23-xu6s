import { effectiveZone } from "../admission";
import { useTurnover } from "../store";
import { ZONE_LABELS, type Zone } from "../types";
import { CarrierCard } from "./CarrierCard";

const ZONE_ORDER: Zone[] = ["available", "in_use", "wash_pending", "washing"];

const ZONE_HINTS: Record<Zone, string> = {
  available: "已卸片且清洗在有效期内，可分配新批次",
  in_use: "装着硅片或绑定批次，卸片前不得再次分配",
  wash_pending: "清洗过期或检测不合格，停区等待清洗",
  washing: "清洗中，需录入批次、残留检测与湿度复测",
};

export function TurnoverBoard() {
  const { state, now } = useTurnover();

  const grouped = ZONE_ORDER.map((zone) => ({
    zone,
    carriers: state.carriers.filter((c) => effectiveZone(c, now) === zone),
  }));

  return (
    <section className="board">
      {grouped.map(({ zone, carriers }) => (
        <div key={zone} className={`zone-column zone-col-${zone}`}>
          <header className="zone-head">
            <h2>{ZONE_LABELS[zone]}</h2>
            <span className="zone-count">{carriers.length}</span>
          </header>
          <p className="zone-hint">{ZONE_HINTS[zone]}</p>
          <div className="zone-cards">
            {carriers.length === 0 ? (
              <div className="zone-empty">暂无载具</div>
            ) : (
              carriers.map((carrier) => <CarrierCard key={carrier.id} carrier={carrier} />)
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
