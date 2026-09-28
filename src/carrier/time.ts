// 时间与通用小工具

export const HOUR_MS = 3600 * 1000;

let counter = 0;
export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

/** 距清洗截止的余量：剩余 … / 已超 … */
export function formatGap(deadline: number, now: number): string {
  const diff = deadline - now;
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / HOUR_MS);
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  const core =
    days > 0
      ? `${days}天${restHours}小时`
      : hours > 0
      ? `${hours}小时`
      : `${Math.max(1, Math.round(abs / 60000))}分钟`;
  return diff >= 0 ? `剩余 ${core}` : `已超 ${core}`;
}

/** <input type="datetime-local"> 的回填值 */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}
