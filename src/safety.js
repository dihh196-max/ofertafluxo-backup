import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fileFor = userId => path.resolve('data/users', String(userId), 'delivery-audit.json');
let deliveryChain = Promise.resolve();
let lastCompletedAt = 0;

export const safetyDefaults = {
  enabled: true,
  maxPerHour: 12,
  maxPerDay: 48,
  minMinutesPerDestination: 45,
  minSecondsBetweenMessages: 8,
  quietStartHour: 22,
  quietEndHour: 8,
  timeZone: 'America/Cuiaba'
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const read = userId => {
  const file = fileFor(userId);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
};
const write = (userId, entries) => {
  const file = fileFor(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries.slice(-10_000), null, 2));
};
const partsAt = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
}).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
const elapsed = (entry, now) => now.getTime() - new Date(entry.createdAt).getTime();

export function normalizeSafety(value = {}) {
  return {
    enabled: value.enabled !== false,
    maxPerHour: clamp(value.maxPerHour, 1, 20, safetyDefaults.maxPerHour),
    maxPerDay: clamp(value.maxPerDay, 1, 100, safetyDefaults.maxPerDay),
    minMinutesPerDestination: clamp(value.minMinutesPerDestination, 15, 360, safetyDefaults.minMinutesPerDestination),
    minSecondsBetweenMessages: clamp(value.minSecondsBetweenMessages, 5, 60, safetyDefaults.minSecondsBetweenMessages),
    quietStartHour: clamp(value.quietStartHour, 0, 23, safetyDefaults.quietStartHour),
    quietEndHour: clamp(value.quietEndHour, 0, 23, safetyDefaults.quietEndHour),
    timeZone: safetyDefaults.timeZone
  };
}

export function automationWindowOpen(safety, now = new Date()) {
  if (!safety.enabled) return true;
  const hour = Number(partsAt(now, safety.timeZone).hour);
  const { quietStartHour: start, quietEndHour: end } = safety;
  if (start === end) return true;
  return start < end ? hour < start || hour >= end : hour >= end && hour < start;
}

export function safetySummary(userId, safety, now = new Date()) {
  const entries = read(userId);
  const sentLastHour = entries.filter(entry => elapsed(entry, now) < 60 * 60_000).length;
  const sentToday = entries.filter(entry => {
    const current = partsAt(now, safety.timeZone);
    const sent = partsAt(new Date(entry.createdAt), safety.timeZone);
    return current.year === sent.year && current.month === sent.month && current.day === sent.day;
  }).length;
  return {
    ...safety,
    sentLastHour,
    sentToday,
    automationWindowOpen: automationWindowOpen(safety, now)
  };
}

export function reserveDelivery(userId, destination, safety, now = new Date()) {
  const entries = read(userId);
  if (safety.enabled) {
    const hourly = entries.filter(entry => elapsed(entry, now) < 60 * 60_000).length;
    if (hourly >= safety.maxPerHour) throw new Error(`Limite de segurança de ${safety.maxPerHour} envios por hora atingido.`);
    const today = safetySummary(userId, safety, now).sentToday;
    if (today >= safety.maxPerDay) throw new Error(`Limite de segurança de ${safety.maxPerDay} envios por dia atingido.`);
    const lastDestination = entries.filter(entry => entry.destinationId === destination.id).at(-1);
    if (lastDestination && elapsed(lastDestination, now) < safety.minMinutesPerDestination * 60_000) {
      throw new Error(`O destino “${destination.name}” está no intervalo mínimo de segurança.`);
    }
  }
  const record = { id: crypto.randomUUID(), destinationId: destination.id, destinationName: destination.name, createdAt: now.toISOString(), status: 'reserved' };
  entries.push(record); write(userId, entries);
  return record;
}

function updateReservation(userId, id, change) {
  const entries = read(userId);
  const entry = entries.find(item => item.id === id);
  if (entry) Object.assign(entry, change);
  write(userId, entries);
}
export function confirmDelivery(userId, reservation, offer) {
  updateReservation(userId, reservation.id, { status: 'sent', offerId: offer.id, completedAt: new Date().toISOString() });
}
export function failDelivery(userId, reservation, error) {
  updateReservation(userId, reservation.id, { status: 'failed', completedAt: new Date().toISOString(), error: String(error?.message || error || 'Falha').slice(0, 240) });
}

export function queueDelivery(task, safety) {
  const queued = deliveryChain.then(async () => {
    const wait = Math.max(0, safety.minSecondsBetweenMessages * 1000 - (Date.now() - lastCompletedAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    try { return await task(); } finally { lastCompletedAt = Date.now(); }
  });
  deliveryChain = queued.catch(() => {});
  return queued;
}
