// 载具周转状态机：当前资料与周转状态在此变更；准入规则引用 admission，每步动作追加 archive 留档。

import {
  useReducer,
  useEffect,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
  type Dispatch,
} from "react";
import { assignmentBlockers, isWashExpired, routeAfterWash } from "./admission";
import {
  appendEvent,
  effectiveWashResult,
  findWashCompleted,
} from "./archive";
import { seedState } from "./seed";
import type {
  ArchiveEvent,
  Carrier,
  TurnoverAction,
  TurnoverState,
} from "./types";

function withCarrier(state: TurnoverState, id: string) {
  const carriers = state.carriers.map((c) => (c.id === id ? { ...c } : c));
  const carrier = carriers.find((c) => c.id === id);
  return { carriers, carrier };
}

export function reducer(state: TurnoverState, action: TurnoverAction): TurnoverState {
  const now = "at" in action && action.at ? action.at : Date.now();

  switch (action.type) {
    case "reset":
      return seedState();

    case "register": {
      const id = action.id.trim().toUpperCase();
      if (!id) return state;
      if (state.carriers.some((c) => c.id === id)) {
        return state;
      }
      const carriers = [...state.carriers];
      const carrier: Carrier = {
        id,
        grade: action.grade,
        registeredAt: now,
        washCycleHours: action.washCycleHours,
        lastCleanedAt: action.lastCleanedAt,
        lastWashBatchId: null,
        batchId: null,
        wafersLoaded: false,
        zone: "available",
        residuePass: null,
        humidityPass: null,
      };
      carriers.push(carrier);
      const events = [...state.events];
      appendEvent(
        events,
        {
          kind: "registered",
          carrierId: id,
          grade: action.grade,
          lastCleanedAt: action.lastCleanedAt,
          washCycleHours: action.washCycleHours,
        },
        now,
      );
      return { carriers, events };
    }

    case "assign": {
      const batchId = action.batchId.trim();
      if (!batchId) return state;
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier) return state;
      const events = [...state.events];
      const blockers = assignmentBlockers(carrier, now);
      if (blockers.length > 0) {
        appendEvent(
          events,
          { kind: "blocked", carrierId: action.id, blockedAction: "分配", blockedReasons: blockers },
          now,
        );
        return { carriers, events };
      }
      carrier.batchId = batchId;
      carrier.wafersLoaded = true;
      carrier.zone = "in_use";
      appendEvent(events, { kind: "assigned", carrierId: action.id, batchId }, now);
      return { carriers, events };
    }

    case "unload": {
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier || !carrier.wafersLoaded) return state;
      const events = [...state.events];
      const batchId = carrier.batchId ?? "";
      carrier.wafersLoaded = false;
      carrier.batchId = null;
      // 卸片后：清洗过期即落待洗区，否则回可用区等待再次分配
      const routedTo = isWashExpired(carrier, now) ? "wash_pending" : "available";
      carrier.zone = routedTo;
      appendEvent(events, { kind: "unloaded", carrierId: action.id, batchId, routedTo }, now);
      if (routedTo === "wash_pending") {
        appendEvent(
          events,
          { kind: "wash_held", carrierId: action.id, holdReason: "清洗周期已过" },
          now,
        );
      }
      return { carriers, events };
    }

    case "release": {
      const reason = action.reason.trim();
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier) return state;
      const events = [...state.events];
      const blockers: string[] = [];
      if (carrier.zone !== "in_use") blockers.push("载具不在周转中，无批次可释放");
      if (!reason) blockers.push("退回/取消原因不能为空");
      if (blockers.length > 0) {
        appendEvent(
          events,
          { kind: "blocked", carrierId: action.id, blockedAction: "退回释放", blockedReasons: blockers },
          now,
        );
        return { carriers, events };
      }
      const batchId = carrier.batchId ?? "";
      carrier.batchId = null;
      // 退回时载具视为已卸片释放
      carrier.wafersLoaded = false;
      const routedTo = isWashExpired(carrier, now) ? "wash_pending" : "available";
      carrier.zone = routedTo;
      appendEvent(
        events,
        { kind: "released", carrierId: action.id, batchId, releaseReason: reason, routedTo },
        now,
      );
      if (routedTo === "wash_pending") {
        appendEvent(
          events,
          { kind: "wash_held", carrierId: action.id, holdReason: "清洗周期已过" },
          now,
        );
      }
      return { carriers, events };
    }

    case "startWash": {
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier) return state;
      const events = [...state.events];
      const blockers: string[] = [];
      if (carrier.zone === "washing") blockers.push("载具已在清洗中");
      if (carrier.zone === "in_use") {
        if (carrier.wafersLoaded) blockers.push("载具仍装着硅片，需先卸片");
        else blockers.push("载具仍绑定批次，需先退回释放");
      }
      if (carrier.zone === "available" && !isWashExpired(carrier, now)) {
        blockers.push("清洗未过期，无需停洗");
      }
      if (blockers.length > 0) {
        appendEvent(
          events,
          { kind: "blocked", carrierId: action.id, blockedAction: "开始清洗", blockedReasons: blockers },
          now,
        );
        return { carriers, events };
      }
      const heldForFailed = carrier.residuePass === false || carrier.humidityPass === false;
      const holdReasonText = heldForFailed ? "检测不合格，返洗" : "清洗周期已过";
      appendEvent(
        events,
        { kind: "wash_held", carrierId: action.id, holdReason: holdReasonText },
        now,
      );
      appendEvent(events, { kind: "wash_started", carrierId: action.id }, now);
      carrier.zone = "washing";
      return { carriers, events };
    }

    case "completeWash": {
      const batchId = action.batchId.trim();
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier) return state;
      const events = [...state.events];
      const blockers: string[] = [];
      if (carrier.zone !== "washing") blockers.push("载具不在清洗中");
      if (!batchId) blockers.push("清洗批次不能为空");
      if (blockers.length > 0) {
        appendEvent(
          events,
          { kind: "blocked", carrierId: action.id, blockedAction: "完成清洗", blockedReasons: blockers },
          now,
        );
        return { carriers, events };
      }
      const accepted = action.residuePass && action.humidityPass;
      appendEvent(
        events,
        {
          kind: "wash_completed",
          carrierId: action.id,
          batchId,
          residuePass: action.residuePass,
          humidityPass: action.humidityPass,
          accepted,
        },
        now,
      );
      carrier.zone = routeAfterWash(action.residuePass, action.humidityPass);
      carrier.residuePass = action.residuePass;
      carrier.humidityPass = action.humidityPass;
      carrier.lastWashBatchId = batchId;
      if (accepted) carrier.lastCleanedAt = now;
      return { carriers, events };
    }

    case "correctWash": {
      const reason = action.reason.trim();
      const { carriers, carrier } = withCarrier(state, action.id);
      if (!carrier) return state;
      const events = [...state.events];
      const washEvent = findWashCompleted(events, action.refSeq);
      const blockers: string[] = [];
      if (!washEvent) blockers.push("未找到要更正的清洗记录");
      else if (washEvent.carrierId !== action.id) blockers.push("更正记录与载具不匹配");
      if (carrier.zone === "washing") blockers.push("载具正在清洗，结果不可更正");
      if (carrier.zone === "in_use") blockers.push("载具周转中，结果不可更正");
      if (!reason) blockers.push("更正原因不能为空");
      if (blockers.length > 0) {
        appendEvent(
          events,
          { kind: "blocked", carrierId: action.id, blockedAction: "结果更正", blockedReasons: blockers },
          now,
        );
        return { carriers, events };
      }
      if (!washEvent) return state;
      const oldResult = effectiveWashResult(events, washEvent.seq);
      const newResult = { residuePass: action.residuePass, humidityPass: action.humidityPass };
      if (oldResult.residuePass === newResult.residuePass && oldResult.humidityPass === newResult.humidityPass) {
        return state;
      }
      // 另写更正事件，原 wash_completed 与其后留档均不覆盖
      appendEvent(
        events,
        {
          kind: "corrected",
          carrierId: action.id,
          refSeq: washEvent.seq,
          oldResult,
          newResult,
          correctReason: reason,
        },
        now,
      );
      carrier.residuePass = newResult.residuePass;
      carrier.humidityPass = newResult.humidityPass;
      carrier.zone = routeAfterWash(newResult.residuePass, newResult.humidityPass);
      if (newResult.residuePass && newResult.humidityPass) {
        // 改判合格：以原清洗完成时刻作为上次清洗时刻
        carrier.lastCleanedAt = washEvent.at;
        carrier.lastWashBatchId = washEvent.batchId;
      }
      return { carriers, events };
    }

    default:
      return state;
  }
}

interface TurnoverStore {
  state: TurnoverState;
  dispatch: Dispatch<TurnoverAction>;
  now: number;
}

const TurnoverContext = createContext<TurnoverStore | null>(null);

export function TurnoverProvider({ children }: { children: ReactNode }) {
  // 每秒刷新当前时刻，过期落区与剩余倒计时随之重算
  const [state, dispatch] = useReducer(reducer, undefined, () => seedState());
  const [now, setNow] = useReducer((prev: number) => {
    void prev;
    return Date.now();
  }, Date.now());

  useEffect(() => {
    const timer = setInterval(setNow, 1000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo(() => ({ state, dispatch, now }), [state, now]);
  return <TurnoverContext.Provider value={value}>{children}</TurnoverContext.Provider>;
}

export function useTurnover(): TurnoverStore {
  const store = useContext(TurnoverContext);
  if (!store) throw new Error("useTurnover 必须在 TurnoverProvider 内使用");
  return store;
}

export type { ArchiveEvent };
