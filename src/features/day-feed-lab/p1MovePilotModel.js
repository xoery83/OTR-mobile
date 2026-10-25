const DAY = 86400000;
const pad = (value) => String(value).padStart(2, "0");
const parts = (instant, zone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

export function snapMinutes(minutes, step = 10) {
  if (![10, 30, 60].includes(step)) throw new RangeError("INVALID_TIME_TICK");
  return Math.max(0, Math.min(1440 - step, Math.round(minutes / step) * step));
}
export function snapTenMinutes(minutes) {
  return snapMinutes(minutes, 10);
}
export function timeTick(minutes, step, offset) {
  if (![10, 30, 60].includes(step)) throw new RangeError("INVALID_TIME_TICK");
  if (!offset) return minutes;
  const tick =
    (offset > 0 ? Math.floor(minutes / step) : Math.ceil(minutes / step)) * step +
    offset * step;
  return tick >= 0 && tick < 1440 ? tick : null;
}
export function scrubTicksPerSecond(offsetPoints) {
  const distance = Math.abs(offsetPoints);
  if (distance <= 8) return 0;
  return Math.sign(offsetPoints) * Math.min(3.5, 1.2 + (distance - 8) / 55);
}
export function clockForMinutes(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
export function durationMinutes(item) {
  const start = Date.parse(item.instant || ""),
    end = Date.parse(item.endInstant || "");
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? (end - start) / 60000
    : null;
}

// A unique zone match is required: a DST gap or fold cannot be promoted to an instant.
function uniqueInstant(date, time, zone) {
  const local = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(local) || !zone) return null;
  const matches = new Set();
  const offsets = new Set(
    [local - DAY, local, local + DAY].map((probe) => {
      const p = parts(probe, zone);
      return (
        (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - probe) / 60000
      );
    }),
  );
  for (const offset of offsets) {
    const candidate = local - offset * 60000;
    const p = parts(candidate, zone);
    if (`${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time)
      matches.add(candidate);
  }
  return matches.size === 1 ? [...matches][0] : null;
}
export function moveProposal(
  item,
  date,
  minutes,
  ntc = false,
  retainedDuration = durationMinutes(item),
  preserveMinute = false,
) {
  if (item.availability !== "AVAILABLE" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { status: "UNAVAILABLE" };
  const duration =
    Number.isFinite(retainedDuration) && retainedDuration > 0 ? retainedDuration : null;
  if (ntc)
    return {
      status: "READY",
      date,
      time: null,
      endTime: null,
      endDate: null,
      instant: null,
      endInstant: null,
      precision: "DATE_ONLY",
      durationMinutes: duration,
      zone: item.zone || null,
    };
  // Native changes precision without moving time; only actual ticks align the minute.
  const time = clockForMinutes(preserveMinute ? minutes : snapTenMinutes(minutes));
  const instant = uniqueInstant(date, time, item.zone);
  if (instant === null)
    return { status: "UNQUALIFIED_TIME", date, time, durationMinutes: duration };
  const endInstant = duration === null ? null : instant + duration * 60000;
  const end = endInstant === null ? null : parts(endInstant, item.zone);
  return {
    status: "READY",
    date,
    time,
    instant: new Date(instant).toISOString(),
    endDate: end ? `${end.year}-${end.month}-${end.day}` : null,
    endTime: end ? `${end.hour}:${end.minute}` : null,
    endInstant: end ? new Date(endInstant).toISOString() : null,
    precision: "MINUTE",
    durationMinutes: duration,
    zone: item.zone,
  };
}
export function applyMove(item, proposal) {
  if (proposal.status !== "READY") return item;
  return {
    ...item,
    date: proposal.date,
    time: proposal.time,
    endDate: proposal.endDate,
    endTime: proposal.endTime,
    instant: proposal.instant,
    endInstant: proposal.endInstant,
    precision: proposal.precision,
    zone: proposal.zone,
  };
}
export function samePlacement(item, proposal) {
  if (proposal.status !== "READY" || item.date !== proposal.date) return false;
  const qualified = Boolean(item.time && item.zone && item.instant);
  return proposal.time ? qualified && item.time === proposal.time : !qualified;
}
