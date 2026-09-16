import fs from 'node:fs';
import path from 'node:path';
import { offerDedupKeys } from './offers.js';

const fileFor = userId => path.resolve('data/users', String(userId), 'sent-offers.json');
const RECENT_SENT_DAYS = 14;

export function readSentIds(userId, destinationId) {
  const file = fileFor(userId);
  if (!fs.existsSync(file)) return new Set();
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cutoff = Date.now() - RECENT_SENT_DAYS * 24 * 60 * 60 * 1000;
  // Evita repetição recente para o mesmo grupo, mas não deixa um histórico
  // antigo (ou um registro legado sem data) esgotar o catálogo para sempre.
  return new Set(entries
    .filter(entry => {
      const sentAt = Date.parse(entry.sentAt || entry.at || '');
      const isRecent = Number.isFinite(sentAt) && sentAt >= cutoff;
      return isRecent && (!entry.destinationId || entry.destinationId === destinationId);
    })
    .flatMap(entry => [entry.id, ...(Array.isArray(entry.dedupKeys) ? entry.dedupKeys : [])])
    .filter(Boolean));
}

export function rememberSent(userId, records) {
  const file = fileFor(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const now = new Date().toISOString();
  const entries = records.map(record => {
    const offer = record.offer || record;
    return {
      id: offer.id,
      dedupKeys: offerDedupKeys(offer),
      destinationId: record.destinationId || null,
      categoryId: record.categoryId || null,
      sentAt: now
    };
  });
  const merged = [...previous, ...entries].slice(-5000);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
}
