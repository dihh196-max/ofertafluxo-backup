import fs from 'node:fs';
import path from 'node:path';
import { VIDEO_STATUSES } from './video-scout-config.js';

const candidateFile = userId => path.resolve('data/users', String(userId), 'video-candidates.json');
const empty = () => ({ version: 1, products: {} });

function read(userId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(candidateFile(userId), 'utf8'));
    return parsed?.products && typeof parsed.products === 'object' ? parsed : empty();
  } catch { return empty(); }
}
function write(userId, value) {
  const file = candidateFile(userId); const temp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
const sameDay = (value, now) => value && new Date(value).toDateString() === new Date(now).toDateString();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function nextStatus(existing, eligible, channel) {
  if (existing?.status === 'PUBLICADO') return 'PUBLICADO';
  // Etapas escolhidas no painel pertencem ao usuário, não ao garimpo automático.
  // Uma nova consulta só atualiza dados e pontuações; nunca desfaz esse progresso.
  if (existing?.status_source === 'manual') return existing.status;
  if (!eligible) return 'FORA_DO_CRITERIO';
  if (!existing || existing.status === 'FORA_DO_CRITERIO') return 'NOVO';
  // Ignorado, selecionado e os estágios de produção são decisões manuais.
  return existing.status || 'NOVO';
}

export function upsertVideoCandidates(userId, channel, candidates, now = new Date().toISOString(), scanId = '') {
  const database = read(userId); const results = [];
  for (const candidate of candidates) {
    const id = String(candidate.shopee_product_id);
    if (!id) continue;
    const existing = database.products[id];
    const merged = {
      ...existing,
      ...candidate,
      id: existing?.id || id,
      shopee_product_id: id,
      first_seen_at: existing?.first_seen_at || now,
      last_seen_at: now,
      last_checked_at: now,
      last_scan_id: scanId || existing?.last_scan_id || null,
      // A elegibilidade é independente por canal: uma venda alta pode remover
      // Shopee Video, mas não deve retirar um candidato viral do Instagram.
      for_shopee_video: channel === 'shopee' ? Boolean(candidate.for_shopee_video) : Boolean(existing?.for_shopee_video),
      for_instagram: channel === 'instagram' ? Boolean(candidate.for_instagram) : Boolean(existing?.for_instagram)
    };
    const eligible = merged.for_shopee_video || merged.for_instagram;
    merged.status = nextStatus(existing, eligible, channel);
    database.products[id] = merged;
    results.push(merged);
  }
  write(userId, database);
  return results;
}

export function updateVideoCandidateStatus(userId, id, status) {
  if (!VIDEO_STATUSES.includes(status)) throw new Error('Status inválido.');
  const database = read(userId); const item = database.products[String(id)];
  if (!item) throw new Error('Produto não encontrado.');
  item.status = status;
  item.status_source = 'manual';
  item.manual_status_updated_at = new Date().toISOString();
  item.last_checked_at = item.manual_status_updated_at;
  write(userId, database); return item;
}

export function listVideoCandidates(userId, filters = {}) {
  let rows = Object.values(read(userId).products);
  const channel = filters.channel || 'shopee';
  if (channel === 'shopee') rows = rows.filter(item => item.for_shopee_video);
  if (channel === 'instagram') rows = rows.filter(item => item.for_instagram);
  if (filters.category) rows = rows.filter(item => item.category === filters.category);
  if (filters.categoryId) rows = rows.filter(item => item.category_id === filters.categoryId);
  if (filters.subcategory) rows = rows.filter(item => item.subcategory === filters.subcategory);
  if (filters.status) rows = rows.filter(item => item.status === filters.status);
  if (filters.scanId) rows = rows.filter(item => item.last_scan_id === filters.scanId);
  if (filters.minScore !== undefined) rows = rows.filter(item => number(channel === 'instagram' ? item.instagram_viral_score : item.shopee_video_score) >= number(filters.minScore));
  if (filters.minCommission !== undefined) rows = rows.filter(item => number(item.affiliate_commission_percent) >= number(filters.minCommission));
  if (filters.maxSales !== undefined && channel !== 'instagram') rows = rows.filter(item => number(item.sold_count) <= number(filters.maxSales));
  if (filters.minPrice !== undefined) rows = rows.filter(item => number(item.preco_atual) >= number(filters.minPrice));
  if (filters.maxPrice !== undefined) rows = rows.filter(item => number(item.preco_atual) <= number(filters.maxPrice));
  if (filters.creatorVideos === 'zero') rows = rows.filter(item => item.creator_video_count === 0);
  if (filters.creatorVideos === 'unknown') rows = rows.filter(item => item.creator_video_count === null || item.creator_video_count === undefined);
  if (filters.onlyNew) rows = rows.filter(item => item.status === 'NOVO');
  if (filters.onlyBoth) rows = rows.filter(item => item.for_shopee_video && item.for_instagram);
  const score = item => number(channel === 'instagram' ? item.instagram_viral_score : item.shopee_video_score);
  const ordered = rows.sort((left, right) => score(right) - score(left) || number(right.affiliate_commission_percent) - number(left.affiliate_commission_percent) || (channel === 'instagram' ? 0 : number(left.sold_count) - number(right.sold_count)));
  const limit = Number(filters.limit);
  return Number.isFinite(limit) && limit > 0 ? ordered.slice(0, Math.min(limit, 100)) : ordered;
}

export function knownVideoCandidateIds(userId) {
  return new Set(Object.keys(read(userId).products));
}

export function videoCandidateSummary(userId, now = new Date().toISOString()) {
  const rows = Object.values(read(userId).products);
  const today = rows.filter(item => sameDay(item.first_seen_at, now));
  return {
    total: rows.length,
    foundToday: today.length,
    newShopee: today.filter(item => item.for_shopee_video && item.status === 'NOVO').length,
    newInstagram: today.filter(item => item.for_instagram && item.status === 'NOVO').length,
    both: rows.filter(item => item.for_shopee_video && item.for_instagram).length,
    highestCommission: Math.max(0, ...rows.map(item => number(item.affiliate_commission_percent))),
    highestShopeeScore: Math.max(0, ...rows.map(item => number(item.shopee_video_score))),
    highestInstagramScore: Math.max(0, ...rows.map(item => number(item.instagram_viral_score)))
  };
}
