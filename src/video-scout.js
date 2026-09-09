import crypto from 'node:crypto';
import { getShopeeOffers } from './shopee.js';
import { normalizeOffers } from './offers.js';
import { creatorVideoCountForProduct } from './creator-video-provider.js';
import { knownVideoCandidateIds, upsertVideoCandidates } from './video-candidate-store.js';
import {
  beforeAfterKeywords, cleaningKeywords, homeKeywords, kitchenKeywords,
  organizationKeywords, problemKeywords, videoScoutCategories, visualKeywords
} from './video-scout-config.js';

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const includesAny = (text, words) => words.some(word => text.includes(normalize(word)));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 100) / 100;
const commissionPercent = offer => {
  const value = Number(offer.commissionRate || 0);
  return round(value > 0 && value <= 1 ? value * 100 : value);
};
const validUrl = value => /^https:\/\//i.test(String(value || ''));
const unique = offers => offers.filter((offer, index, list) => list.findIndex(item => item.id === offer.id) === index);
const belongsToCatalog = (offer, catalog) => {
  const title = normalize(`${offer.title} ${offer.shop}`);
  const includes = catalog.includeKeywords || [];
  const excludes = catalog.excludeKeywords || [];
  if (excludes.length && includesAny(title, excludes)) return false;
  return !includes.length || includesAny(title, includes);
};

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length); const errors = []; let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = index++;
      try { results[current] = await mapper(items[current]); } catch (error) { results[current] = []; errors.push(error); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { results, errors };
}

async function searchOffers(settings, terms, page) {
  // As consultas abrangem famílias amplas; a aprovação não depende de nicho.
  const queries = [...new Set(terms.map(term => term === null ? null : String(term).trim()).filter(term => term === null || term))];
  const pagesPerTerm = Math.max(1, Number(settings.videoScout.pagesPerTerm || 1));
  const jobs = queries.flatMap(keyword => Array.from({ length: pagesPerTerm }, (_, offset) => ({
    keyword,
    page: ((Number(page) - 1 + offset) % 50) + 1
  })));
  const { results: lists, errors } = await mapWithConcurrency(jobs, settings.videoScout.maxConcurrentSearches, async ({ keyword, page: requestPage }) => {
    // O schema da Affiliate Open API suporta no máximo 50 por consulta. Vários
    // termos por categoria permitem reunir até 100+ candidatos sem excedê-lo.
    const data = await getShopeeOffers(settings.shopee, { keyword, page: requestPage, limit: 50 });
    return normalizeOffers(data);
  });
  const offers = unique(lists.flat());
  if (!offers.length && errors.length) throw new Error(`A Shopee não retornou produtos para esta categoria: ${errors[0].message}`);
  return offers;
}

const defaultCategory = videoScoutCategories[0];

function opportunityScore(offer, config) {
  const title = normalize(offer.title);
  let score = 20;
  if (title.length >= 12) score += 10;
  if (offer.price > 0 && offer.price <= config.preferredPriceMax) score += 25;
  else if (offer.price > 0) score += 10;
  score += clamp(Number(offer.discount || 0) * 0.25, 0, 20);
  score += clamp(Number(offer.rating || 0) * 5, 0, 25);
  // Sinais de demonstração, novidade e solução visível costumam gerar melhor
  // retenção em vídeos curtos. Eles são prioridade de ranking, nunca bloqueio.
  const hasVisual = includesAny(title, visualKeywords) || includesAny(title, kitchenKeywords);
  const solvesProblem = includesAny(title, problemKeywords) || includesAny(title, cleaningKeywords);
  const beforeAfter = includesAny(title, beforeAfterKeywords);
  const novelty = includesAny(title, ['inteligente', 'multifuncional', 'inovador', 'diferente', 'portatil', 'portátil', '2 em 1', '3 em 1']);
  if (hasVisual) score += 12;
  if (solvesProblem) score += 10;
  if (beforeAfter) score += 8;
  if (novelty) score += 8;
  return clamp(score);
}

function priceValueScore(offer, config) {
  const priceBonus = offer.price <= config.preferredPriceMax ? 55 : Math.max(0, 55 - (offer.price - config.preferredPriceMax) / 4);
  const discountBonus = clamp(Number(offer.discount || 0) * 0.9, 0, 45);
  return clamp(priceBonus + discountBonus);
}

function shopeeScore(offer, opportunity, config) {
  const weights = config.weights.shopee;
  const commission = clamp((commissionPercent(offer) / 20) * 100);
  // "Até X vendas" é um alvo de descoberta. O decaimento é gradual para não
  // descartar bons produtos que já iniciaram tração e ainda podem viralizar.
  const lowSales = clamp(100 - (Math.log10(Math.max(0, offer.sales) + 1) / Math.log10(Math.max(1, config.maxSales) + 1)) * 100);
  const rating = clamp((Number(offer.rating || 0) / 5) * 100);
  const value = priceValueScore(offer, config);
  const score = opportunity / 100 * weights.similarity
    + commission / 100 * weights.commission
    + lowSales / 100 * weights.lowSales
    + rating / 100 * weights.rating
    + value / 100 * weights.value;
  const reasons = [
    `Score geral de oportunidade: ${Math.round(opportunity)}%`,
    `Comissão de ${commissionPercent(offer).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
    `${offer.sales} venda(s) registradas`,
    offer.rating ? `Avaliação ${Number(offer.rating).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/5` : 'Avaliação não informada',
    offer.discount ? `Desconto oficial de ${offer.discount}%` : `Preço de R$ ${Number(offer.price).toFixed(2)}`
  ];
  return { score: round(score), reasons };
}

function instagramScore(offer, config) {
  const title = normalize(`${offer.title} ${offer.shop}`);
  const weights = config.weights.instagram;
  const hasVisual = includesAny(title, visualKeywords) || includesAny(title, kitchenKeywords);
  const hasProblem = includesAny(title, problemKeywords) || includesAny(title, cleaningKeywords);
  const hasBeforeAfter = includesAny(title, beforeAfterKeywords);
  const hasOrganization = includesAny(title, organizationKeywords);
  const curiosity = hasVisual || includesAny(title, ['inteligente', 'multifuncional', 'inovador', 'diferente', 'portatil']);
  const value = priceValueScore(offer, config);
  const commission = clamp((commissionPercent(offer) / 20) * 100);
  const rating = clamp((Number(offer.rating || 0) / 5) * 100);
  const score = (hasVisual ? weights.demonstration : 0)
    + (hasProblem ? weights.problem : 0)
    + (curiosity ? weights.curiosity : 0)
    + (hasBeforeAfter ? weights.beforeAfter : 0)
    + value / 100 * weights.value
    + commission / 100 * weights.commission
    + rating / 100 * weights.rating
    + (hasOrganization ? 2 : 0);
  const reasons = [];
  if (hasVisual) reasons.push('Produto demonstra função visualmente');
  if (hasProblem) reasons.push('Resolve um problema visível');
  if (curiosity) reasons.push('Possui gancho de curiosidade ou novidade');
  if (hasBeforeAfter) reasons.push('Permite demonstração de antes e depois');
  if (hasOrganization) reasons.push('Relacionado a organização doméstica');
  if (offer.price <= config.preferredPriceMax) reasons.push(`Preço impulsivo: R$ ${Number(offer.price).toFixed(2)}`);
  if (offer.discount) reasons.push(`Desconto oficial de ${offer.discount}%`);
  reasons.push(`Comissão de ${commissionPercent(offer).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
  return { score: round(clamp(score)), reasons };
}

export async function buildVideoCandidate(offer, channel, config, creatorResult = null, catalog = defaultCategory) {
  const creator = creatorResult || await creatorVideoCountForProduct(offer, config);
  const commission = commissionPercent(offer);
  const baseReasons = [];
  // O alvo de poucas vendas influencia o score. Não é uma rejeição rígida: um
  // produto que já tem tração pode ser excelente para conversão e viralização.
  if (commission < config.minCommissionPercent) baseReasons.push(`Comissão abaixo do mínimo (${commission}%/${config.minCommissionPercent}%)`);
  if (!validUrl(offer.image)) baseReasons.push('Imagem válida indisponível');
  if (!validUrl(offer.url)) baseReasons.push('Link de afiliado válido indisponível');
  if (creator.value !== null && creator.value > config.maxCreatorVideos) baseReasons.push(`Vídeos de criadores acima do máximo (${creator.value}/${config.maxCreatorVideos})`);
  const baseApproved = baseReasons.length === 0;
  const opportunity = opportunityScore(offer, config);
  const shopee = shopeeScore(offer, opportunity, config);
  const instagram = instagramScore(offer, config);
  const forShopee = baseApproved && shopee.score >= config.minShopeeVideoScore;
  const forInstagram = baseApproved && instagram.score >= config.minInstagramViralScore;
  const unknownReason = creator.status === 'UNKNOWN' ? 'Vídeos de criadores: UNKNOWN (fonte oficial não configurada)' : null;
  return {
    shopee_product_id: offer.id,
    nome: offer.title,
    nicho: catalog.id,
    category_id: catalog.id,
    categoria: catalog.label,
    subcategoria: catalog.label,
    nome_loja: offer.shop || '',
    shop_id: '',
    imagem_url: offer.image,
    product_url: offer.url,
    affiliate_url: offer.url,
    preco_atual: round(offer.price),
    preco_original: round(offer.originalPrice || 0),
    desconto_percentual: offer.discount ?? null,
    sold_count: Number(offer.sales || 0),
    affiliate_commission_percent: commission,
    affiliate_commission_value: Number(offer.commission || 0),
    creator_video_count: creator.value,
    creator_video_count_status: creator.status,
    rating: Number(offer.rating || 0),
    review_count: null,
    availability_status: 'OFFER_LISTED',
    base_eligible: baseApproved,
    similarity_score: round(opportunity),
    shopee_video_score: shopee.score,
    instagram_viral_score: instagram.score,
    for_shopee_video: forShopee,
    for_instagram: forInstagram,
    motivo_shopee_video: [...shopee.reasons, ...(unknownReason ? [unknownReason] : []), ...baseReasons],
    motivo_instagram: [...instagram.reasons, ...(unknownReason ? [unknownReason] : []), ...baseReasons],
    status: baseApproved ? 'NOVO' : 'FORA_DO_CRITERIO',
    raw_data: { source: 'Shopee Affiliate Open API', period_end_time: offer.flashEndsAt || null }
  };
}

async function runSearch(settings, channel, catalog, knownIds, scanId, allOffers) {
  // Algumas categorias, como roupas femininas, possuem critérios semânticos
  // próprios para não misturar acessórios e calçados na lista de vestuário.
  const catalogOffers = allOffers.filter(offer => belongsToCatalog(offer, catalog));
  const offers = catalogOffers.filter(offer => !knownIds.has(String(offer.id)));
  const candidates = [];
  const stats = { analyzed: offers.length, skippedExisting: catalogOffers.length - offers.length, approved: 0, lowCommission: 0, tooManySales: 0, unknownCreatorVideos: 0, rejected: 0 };
  for (const offer of offers) {
    const candidate = await buildVideoCandidate(offer, channel, settings.videoScout, null, catalog);
    const approved = channel === 'shopee' ? candidate.for_shopee_video : candidate.for_instagram;
    if (channel === 'shopee' && offer.sales > settings.videoScout.maxSales) stats.tooManySales++;
    if (candidate.affiliate_commission_percent < settings.videoScout.minCommissionPercent) stats.lowCommission++;
    if (candidate.creator_video_count_status === 'UNKNOWN') stats.unknownCreatorVideos++;
    if (approved) stats.approved++; else stats.rejected++;
    candidates.push(candidate);
  }
  const records = upsertVideoCandidates(settings.userId, channel, candidates, new Date().toISOString(), scanId);
  records.forEach(record => knownIds.add(String(record.shopee_product_id)));
  return { channel, catalog: catalog.id, stats, records: records.length, newIds: records.map(record => String(record.shopee_product_id)) };
}

export async function runVideoScout(settings, categoryId = '') {
  // Alterna páginas e nunca reapresenta um ID já salvo para o mesmo usuário.
  const page = ((Number(settings.videoScout.scanPage || 1) - 1) % 50) + 1;
  const nextPage = ((page - 1 + Math.max(1, Number(settings.videoScout.pagesPerTerm || 1))) % 50) + 1;
  const scanId = crypto.randomUUID();
  const knownIds = knownVideoCandidateIds(settings.userId);
  const selected = categoryId ? videoScoutCategories.filter(category => category.id === categoryId) : videoScoutCategories;
  if (!selected.length) throw new Error('Categoria de produtos inválida.');
  const emptyStats = () => ({ analyzed: 0, skippedExisting: 0, approved: 0, lowCommission: 0, tooManySales: 0, unknownCreatorVideos: 0, rejected: 0 });
  const sum = (results, channel) => results.reduce((total, result) => ({
    channel,
    stats: Object.fromEntries(Object.keys(total.stats).map(key => [key, total.stats[key] + result.stats[key]])),
    records: total.records + result.records
  }), { channel, stats: emptyStats(), records: 0 });
  const shopeeByCategory = [];
  const instagramByCategory = [];
  for (const category of selected) {
    // Ambos os canais devem avaliar o mesmo lote inédito. Antes, o primeiro
    // canal marcava os IDs como usados e deixava quase nada para o segundo.
    const existingBeforeCategory = new Set(knownIds);
    // A mesma coleta abastece os dois rankings. Isso dobra a variedade útil
    // sem dobrar requisições à API nem aumentar o risco de limite de uso.
    const allOffers = await searchOffers(settings, category.terms, page);
    const shopeeResult = await runSearch(settings, 'shopee', category, new Set(existingBeforeCategory), scanId, allOffers);
    const instagramResult = await runSearch(settings, 'instagram', category, new Set(existingBeforeCategory), scanId, allOffers);
    [...shopeeResult.newIds, ...instagramResult.newIds].forEach(id => knownIds.add(id));
    shopeeByCategory.push(shopeeResult);
    instagramByCategory.push(instagramResult);
  }
  return { scanId, page, nextPage, categoryId: categoryId || 'all', shopee: sum(shopeeByCategory, 'shopee'), instagram: sum(instagramByCategory, 'instagram'), categories: { shopee: shopeeByCategory, instagram: instagramByCategory } };
}

export { videoScoutCategories };
