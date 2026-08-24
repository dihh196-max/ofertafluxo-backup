import fs from 'node:fs';
import path from 'node:path';

const fileFor = userId => path.resolve('data/users', String(userId), 'sent-offers.json');

export function readSentIds(userId, destinationId) {
  const file = fileFor(userId);
  if (!fs.existsSync(file)) return new Set();
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Registros antigos, sem destino, continuam sendo respeitados para evitar
  // reenviar imediatamente uma oferta já divulgada antes desta atualização.
  return new Set(entries
    .filter(entry => !entry.destinationId || entry.destinationId === destinationId)
    .map(entry => entry.id));
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
      destinationId: record.destinationId || null,
      categoryId: record.categoryId || null,
      sentAt: now
    };
  });
  const merged = [...previous, ...entries].slice(-5000);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
}
