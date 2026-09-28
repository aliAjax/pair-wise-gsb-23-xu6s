// 时间显示：时刻格式化与清洗倒计时（看板只读展示用）

import { washDeadline } from "./admission";
import type { Carrier } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function formatDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600_000);
  const minutes = Math.floor((abs % 3600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const text = hours > 0 ? `${hours}小时${pad(minutes)}分` : `${minutes}分${pad(seconds)}秒`;
  return ms < 0 ? `已过期 ${text}` : `剩余 ${text}`;
}

export function remainingWashMs(carrier: Carrier, now: number): number {
  return washDeadline(carrier) - now;
}
