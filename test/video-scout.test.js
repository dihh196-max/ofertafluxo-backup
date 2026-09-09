import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeOffers } from '../src/offers.js';
import { buildVideoCandidate, videoScoutCategories } from '../src/video-scout.js';
import { defaultVideoScout, normalizeVideoScout } from '../src/video-scout-config.js';
import { listVideoCandidates, updateVideoCandidateStatus, upsertVideoCandidates } from '../src/video-candidate-store.js';

const userId = `test-video-scout-${crypto.randomUUID()}`;
const dataDir = path.resolve('data/users', userId);
const config = normalizeVideoScout({ minInstagramViralScore: 0 }, defaultVideoScout);
const creator = value => ({ value, status: value === null ? 'UNKNOWN' : 'KNOWN', source: 'test' });

function offer(overrides = {}) {
  return normalizeOffers({ productOfferV2: { nodes: [{
    itemId: 912345, productName: 'Lençol Queen 400 fios com elástico', offerLink: 'https://s.shopee.com.br/teste', imageUrl: 'https://example.com/image.jpg',
    price: 59.9, priceDiscountRate: 30, commissionRate: 0.1, sales: 20, ratingStar: 4.8, shopName: 'Casa Teste', ...overrides
  }] } })[0];
}

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('comissão e creator videos são critérios obrigatórios; vendas são prioridade de ranking', async () => {
  assert.equal((await buildVideoCandidate(offer({ sales: 21 }), 'shopee', config, creator(0))).for_shopee_video, true);
  assert.equal((await buildVideoCandidate(offer({ sales: 20 }), 'shopee', config, creator(0))).for_shopee_video, true);
  assert.equal((await buildVideoCandidate(offer({ commissionRate: 0.0999 }), 'shopee', config, creator(0))).for_shopee_video, false);
  assert.equal((await buildVideoCandidate(offer(), 'shopee', config, creator(1))).for_shopee_video, false);
  assert.equal((await buildVideoCandidate(offer(), 'shopee', config, creator(0))).for_shopee_video, true);
  const unknown = await buildVideoCandidate(offer(), 'shopee', config, creator(null));
  assert.equal(unknown.creator_video_count, null);
  assert.equal(unknown.creator_video_count_status, 'UNKNOWN');
  assert.equal(unknown.for_shopee_video, true);
});

test('produtos com menos vendas recebem melhor prioridade, sem excluir os que já têm tração', async () => {
  const discovery = await buildVideoCandidate(offer({ sales: 5 }), 'shopee', config, creator(0));
  const traction = await buildVideoCandidate(offer({ sales: 200 }), 'shopee', config, creator(0));
  assert.equal(traction.for_shopee_video, true);
  assert.ok(discovery.shopee_video_score > traction.shopee_video_score);
});

test('busca geral aprova produtos de tipos diferentes quando atendem aos critérios', async () => {
  const tools = await buildVideoCandidate(
    offer({ itemId: 912348, productName: 'Kit de ferramentas domésticas multifuncional', sales: 8 }),
    'shopee', config, creator(0), videoScoutCategories[0]
  );
  assert.equal(tools.nicho, 'kitchen');
  assert.equal(tools.categoria, 'Cozinha e utensílios');
  assert.equal(tools.for_shopee_video, true);
  const clothing = await buildVideoCandidate(
    offer({ itemId: 912349, productName: 'Conjunto infantil de algodão', sales: 8 }),
    'shopee', config, creator(0), videoScoutCategories[0]
  );
  assert.equal(clothing.for_shopee_video, true);
});

test('catálogo inclui roupas femininas como categoria independente e volumosa', () => {
  const category = videoScoutCategories.find(item => item.id === 'womens-clothing');
  assert.equal(category?.label, 'Roupas femininas');
  assert.ok(category.terms.length >= 8);
  assert.ok(category.terms.includes('vestido feminino'));
  assert.ok(category.terms.includes('conjunto feminino'));
});

test('upsert usa o product id como índice único e preserva PUBLICADO', async () => {
  const first = await buildVideoCandidate(offer(), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [first]);
  upsertVideoCandidates(userId, 'shopee', [{ ...first, preco_atual: 44.9 }]);
  assert.equal(listVideoCandidates(userId, { channel: 'shopee' }).length, 1);
  assert.equal(listVideoCandidates(userId, { channel: 'shopee' })[0].preco_atual, 44.9);
  updateVideoCandidateStatus(userId, first.shopee_product_id, 'PUBLICADO');
  const invalid = await buildVideoCandidate(offer({ sales: 25 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [invalid]);
  assert.equal(listVideoCandidates(userId, { channel: 'all' })[0].status, 'PUBLICADO');
});

test('status definido no painel permanece após novas buscas e revalidações', async () => {
  const first = await buildVideoCandidate(offer({ itemId: 912347 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [first]);
  updateVideoCandidateStatus(userId, first.shopee_product_id, 'VIDEO_CRIADO');
  const temporarilyInvalid = await buildVideoCandidate(offer({ itemId: 912347, sales: 25 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [temporarilyInvalid]);
  const eligibleAgain = await buildVideoCandidate(offer({ itemId: 912347 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [eligibleAgain]);
  const persisted = listVideoCandidates(userId, { channel: 'all' }).find(item => item.shopee_product_id === '912347');
  assert.equal(persisted.status, 'VIDEO_CRIADO');
  assert.equal(persisted.status_source, 'manual');
});

test('a rodada atual pode listar somente candidatos inéditos', async () => {
  const first = await buildVideoCandidate(offer({ itemId: 912350 }), 'shopee', config, creator(0));
  const second = await buildVideoCandidate(offer({ itemId: 912351 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [first], new Date().toISOString(), 'scan-1');
  upsertVideoCandidates(userId, 'shopee', [second], new Date().toISOString(), 'scan-2');
  const latest = listVideoCandidates(userId, { channel: 'shopee', scanId: 'scan-2' });
  assert.equal(latest.length, 1);
  assert.equal(latest[0].shopee_product_id, '912351');
});

test('produto pode pertencer aos dois canais e conserva elegibilidade quando ganha tração', async () => {
  const product = await buildVideoCandidate(offer({ itemId: 912346, productName: 'Lençol 400 fios com elástico e organizador de roupa de cama' }), 'shopee', config, creator(0));
  const instagram = await buildVideoCandidate(offer({ itemId: 912346, productName: 'Lençol 400 fios com elástico e organizador de roupa de cama' }), 'instagram', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [product]);
  upsertVideoCandidates(userId, 'instagram', [instagram]);
  const both = listVideoCandidates(userId, { channel: 'all' }).find(item => item.shopee_product_id === '912346');
  assert.equal(both.for_shopee_video, true);
  assert.equal(both.for_instagram, true);
  const outside = await buildVideoCandidate(offer({ itemId: 912346, productName: 'Lençol 400 fios com elástico e organizador de roupa de cama', sales: 25 }), 'shopee', config, creator(0));
  upsertVideoCandidates(userId, 'shopee', [outside]);
  const refreshed = listVideoCandidates(userId, { channel: 'all' }).find(item => item.shopee_product_id === '912346');
  assert.equal(refreshed.for_shopee_video, true);
  assert.equal(refreshed.for_instagram, true);
  assert.notEqual(refreshed.status, 'FORA_DO_CRITERIO');
});
