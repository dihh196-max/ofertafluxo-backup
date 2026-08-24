const MIN_INTERLEAVE_MS = 5 * 60_000;

const activeDestinations = destinations => (destinations || [])
  .filter(destination => destination.active && destination.consent)
  .sort((left, right) => String(left.createdAt || left.id).localeCompare(String(right.createdAt || right.id)));

export function automationCadence(destinations, intervalMinutes) {
  const count = Math.max(1, activeDestinations(destinations).length);
  const requestedMs = Math.max(15, Math.min(1440, Number(intervalMinutes || 60))) * 60_000;
  const slotMs = Math.max(MIN_INTERLEAVE_MS, Math.ceil(requestedMs / count));
  return { count, slotMs, cycleMs: slotMs * count };
}

export function createDestinationSchedule(destinations, intervalMinutes, now = Date.now()) {
  const active = activeDestinations(destinations);
  const { slotMs, cycleMs } = automationCadence(active, intervalMinutes);
  return Object.fromEntries(active.map((destination, index) => [destination.id, {
    nextRunAt: new Date(now + slotMs * (index + 1)).toISOString(),
    cycleMs
  }]));
}

export function refreshDestinationSchedule(automation, destinations, now = Date.now()) {
  const active = activeDestinations(destinations);
  const current = automation.destinationSchedule || {};
  const { slotMs, cycleMs } = automationCadence(active, automation.intervalMinutes);
  const schedule = {};
  let tail = now;

  for (const destination of active) {
    const existing = current[destination.id];
    const nextAt = Date.parse(existing?.nextRunAt || '');
    if (Number.isFinite(nextAt)) {
      schedule[destination.id] = { nextRunAt: new Date(nextAt).toISOString(), cycleMs };
      tail = Math.max(tail, nextAt);
    }
  }
  for (const destination of active) {
    if (schedule[destination.id]) continue;
    tail += slotMs;
    schedule[destination.id] = { nextRunAt: new Date(tail).toISOString(), cycleMs };
  }
  return schedule;
}

export function nextDueDestination(destinations, schedule, now = Date.now()) {
  return activeDestinations(destinations)
    .map(destination => ({ destination, at: Date.parse(schedule?.[destination.id]?.nextRunAt || '') }))
    .filter(item => Number.isFinite(item.at) && item.at <= now)
    .sort((left, right) => left.at - right.at)[0]?.destination || null;
}

export function scheduleAfterRun(schedule, destinationId, destinations, intervalMinutes, now = Date.now()) {
  const cadence = automationCadence(destinations, intervalMinutes);
  return {
    ...schedule,
    [destinationId]: { nextRunAt: new Date(now + cadence.cycleMs).toISOString(), cycleMs: cadence.cycleMs }
  };
}

export function scheduleRetry(schedule, destinationId, now = Date.now(), minutes = 5) {
  return {
    ...schedule,
    [destinationId]: { ...schedule[destinationId], nextRunAt: new Date(now + minutes * 60_000).toISOString(), retry: true }
  };
}

export function scheduleStatus(destinations, automation, now = Date.now()) {
  const schedule = refreshDestinationSchedule(automation, destinations, now);
  return activeDestinations(destinations).map(destination => ({
    destinationId: destination.id,
    nextRunAt: schedule[destination.id].nextRunAt
  }));
}
