import test from 'node:test';
import assert from 'node:assert/strict';
import { communitySlotDue, formatCommunityContent, hasPendingCommunityContent, weeklyCommunityCalendar } from '../src/community-content.js';

test('exibe uma programação semanal completa de conteúdo complementar', () => {
  const calendar = weeklyCommunityCalendar();
  assert.equal(calendar.length, 7);
  assert.deepEqual(calendar.map(item => item.weekday), ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']);
});

test('identifica a enquete da segunda no horário de Cuiabá', () => {
  // 12:11 UTC corresponde a 08:11 em Cuiabá (UTC-4).
  const slot = communitySlotDue(new Date('2026-09-14T12:11:00.000Z'));
  assert.equal(slot.id, 'monday-poll');
  assert.match(formatCommunityContent(slot), /ENQUETE DA SEMANA/);
});

test('não agenda o mesmo conteúdo para destino que já o recebeu', () => {
  const now = new Date('2026-09-14T12:11:00.000Z');
  const destination = { id: 'group-1', active: true, consent: true };
  const slot = communitySlotDue(now);
  const state = { sentSlots: { [`${slot.key}:${destination.id}`]: now.toISOString() }, retryAfter: {} };
  assert.equal(hasPendingCommunityContent(state, [destination], now), null);
});
