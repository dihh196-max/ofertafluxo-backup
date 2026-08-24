import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSafety, safetyDefaults } from './safety.js';

const userDir = userId => path.resolve('data/users', String(userId));
const settingsPath = userId => path.join(userDir(userId), 'settings.json');
const activityPath = userId => path.join(userDir(userId), 'activity.json');

export const defaultSettings = {
  shopee: { appId: '', secret: '' },
  filters: { minDiscount: 15, minPrice: 0, maxPrice: 1000, maxOffers: 5, preferredMaxPrice: 80 },
  automation: { enabled: false, intervalMinutes: 60, lastRunAt: null, destinationSchedule: {} },
  safety: safetyDefaults,
  destinations: [],
  evolution: { enabled: false, url: '', apiKey: '', instanceName: '' },
  directWhatsApp: { enabled: true },
  whatsapp: { token: '', phoneNumberId: '', mode: 'text', templateName: '', templateLanguage: 'pt_BR' }
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
export function loadSettings(base, userId) {
  const saved = readJson(settingsPath(userId), {});
  return {
    ...clone(defaultSettings),
    ...saved,
    // Credenciais nunca são herdadas de outro usuário ou do arquivo .env.
    // O primeiro usuário recebe a migração explícita das configurações antigas.
    shopee: { appId: saved.shopee?.appId || '', secret: saved.shopee?.secret || '' },
    filters: { ...defaultSettings.filters, ...base.filters, ...saved.filters },
    automation: { ...defaultSettings.automation, ...saved.automation },
    safety: normalizeSafety({ ...defaultSettings.safety, ...saved.safety }),
    evolution: { ...defaultSettings.evolution, ...base.evolution, ...saved.evolution },
    directWhatsApp: { ...defaultSettings.directWhatsApp, ...saved.directWhatsApp },
    whatsapp: { ...defaultSettings.whatsapp, ...base.whatsapp, ...saved.whatsapp },
    destinations: Array.isArray(saved.destinations) ? saved.destinations.map(destination => ({ ...destination, consent: destination.consent !== false })) : []
  };
}
export function saveSettings(userId, value) { writeJson(settingsPath(userId), value); }
export function publicSettings(value) {
  return {
    shopee: { appId: value.shopee.appId ? `••••${value.shopee.appId.slice(-4)}` : '', connected: Boolean(value.shopee.appId && value.shopee.secret) },
    filters: value.filters,
    automation: value.automation,
    safety: value.safety,
    destinations: value.destinations,
    evolution: { enabled: Boolean(value.evolution.enabled), configured: Boolean(value.evolution.url && value.evolution.apiKey && value.evolution.instanceName), instanceName: value.evolution.instanceName },
    directWhatsApp: value.directWhatsApp,
    whatsapp: { configured: Boolean(value.whatsapp.token && value.whatsapp.phoneNumberId), mode: value.whatsapp.mode }
  };
}
export function newDestination({ name, number, type = 'contact', categoryId = 'all', consent = false }) {
  const input = String(number || '').trim();
  const target = type === 'group' ? input : input.replace(/\D/g, '');
  return { id: crypto.randomUUID(), name: String(name || '').trim(), number: target, type, categoryId: String(categoryId || 'all'), consent: Boolean(consent), consentAt: consent ? new Date().toISOString() : null, active: true, createdAt: new Date().toISOString() };
}
export function activity(userId, limit = 30) { return readJson(activityPath(userId), []).slice(0, limit); }
export function addActivity(userId, entry) {
  const file = activityPath(userId); const items = readJson(file, []);
  items.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  writeJson(file, items.slice(0, 200));
}
export function migrateLegacySettings(userId) {
  const targetDir = userDir(userId); fs.mkdirSync(targetDir, { recursive: true });
  const files = [
    [path.resolve('data/settings.json'), settingsPath(userId)],
    [path.resolve('data/sent-offers.json'), path.join(targetDir, 'sent-offers.json')],
    [path.resolve('data/activity.json'), activityPath(userId)],
    [path.resolve('data/delivery-audit.json'), path.join(targetDir, 'delivery-audit.json')]
  ];
  for (const [legacy, target] of files) if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.copyFileSync(legacy, target);
  const legacySession = path.resolve('data/whatsapp-session'); const userSession = path.join(targetDir, 'whatsapp-session');
  if (fs.existsSync(legacySession) && !fs.existsSync(userSession)) fs.cpSync(legacySession, userSession, { recursive: true });
}
