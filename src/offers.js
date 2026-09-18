function number(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(',', '.'));
  return 0;
}

function cleanCoupon(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) ? code : '';
}

function couponFrom(raw) {
  return cleanCoupon(
    raw.couponCode ?? raw.voucherCode ?? raw.promoCode ?? raw.coupon?.code ?? raw.voucher?.code ?? raw.promotion?.code
  );
}

function timestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed < 100_000_000_000 ? parsed * 1000 : parsed;
  const fromDate = Date.parse(value);
  return Number.isFinite(fromDate) ? fromDate : null;
}

function flashDetails(raw, forceFlash) {
  const label = String(raw.offerName ?? raw.campaignName ?? raw.collectionName ?? raw.offerType ?? '').trim();
  const explicitFlash = raw.isFlashSale === true || raw.flashSale === true || /flash|rel[aâ]mpag/i.test(`${label} ${raw.offerType ?? ''}`);
  return {
    flash: Boolean(forceFlash || explicitFlash),
    campaignLabel: label,
    flashStartsAt: timestamp(raw.periodStartTime ?? raw.startTime ?? raw.startAt),
    flashEndsAt: timestamp(raw.periodEndTime ?? raw.endTime ?? raw.endAt)
  };
}

function locateList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.nodes)) return value.nodes;
    if (Array.isArray(value?.items)) return value.items;
  }
  return [];
}

function officialVideoUrl(raw) {
  const values = [
    raw.videoUrl, raw.videoURL, raw.video?.url, raw.video?.playUrl,
    raw.productVideo?.url, raw.productVideo?.playUrl,
    ...(Array.isArray(raw.videoUrls) ? raw.videoUrls : []),
    ...(Array.isArray(raw.videos) ? raw.videos.map(video => video?.url ?? video?.playUrl) : []),
    ...(Array.isArray(raw.media?.videos) ? raw.media.videos.map(video => video?.url ?? video?.playUrl) : [])
  ];
  return values.map(value => String(value || '').trim()).find(value => /^https:\/\//i.test(value)) || '';
}

export function normalizeOffers(data, { flash = false } = {}) {
  return locateList(data).map(raw => {
    const price = number(raw.price ?? raw.priceMin ?? raw.priceInfo?.price);
    const suppliedOriginalPrice = number(raw.originalPrice ?? raw.priceBeforeDiscount ?? raw.priceInfo?.originalPrice);
    const rawDiscount = raw.discountPercent ?? raw.priceDiscountRate ?? raw.discount ?? raw.discountRate;
    const rawDiscountNumber = number(rawDiscount);
    const discount = suppliedOriginalPrice > price && price > 0
      ? Math.round((1 - price / suppliedOriginalPrice) * 100)
      : rawDiscount === undefined || rawDiscount === null
        ? null
        : Math.round(raw.discountRate !== undefined && rawDiscountNumber > 0 && rawDiscountNumber < 1 ? rawDiscountNumber * 100 : rawDiscountNumber);
    // Algumas respostas da Open API trazem apenas o percentual oficial de
    // desconto. Nesse caso, calculamos o preço anterior a partir desse dado,
    // preservando o valor informado pela Shopee quando ele vier na resposta.
    const originalPrice = suppliedOriginalPrice > price
      ? suppliedOriginalPrice
      : price > 0 && discount > 0 && discount < 100
        ? Math.round((price / (1 - discount / 100)) * 100) / 100
        : 0;
    return {
      id: String(raw.itemId ?? raw.id ?? raw.productId ?? raw.productLink ?? raw.offerLink),
      title: raw.productName ?? raw.name ?? raw.title ?? 'Oferta Shopee',
      url: raw.productLink ?? raw.offerLink ?? raw.link,
      price,
      originalPrice,
      discount,
      image: raw.imageUrl ?? raw.image,
      // Só aceita URL retornada na própria resposta oficial da Open API. Não
      // consulta páginas, não faz scraping e não usa mídia de terceiros.
      officialVideoUrl: officialVideoUrl(raw),
      sales: number(raw.sales ?? raw.sold ?? raw.soldCount),
      shop: raw.shopName,
      commission: raw.commission,
      commissionRate: number(raw.commissionRate),
      rating: number(raw.ratingStar),
      couponCode: couponFrom(raw),
      ...flashDetails(raw, flash)
    };
  }).filter(offer => offer.id && offer.url && offer.price > 0);
}

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.search = '';
    url.hash = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return ''; }
}

// A Open API pode listar o mesmo produto em campanhas, variações ou links de
// afiliado diferentes. A assinatura combina título e imagem (quando há) para
// impedir repetição visual sem depender só do ID técnico retornado pela lista.
export function offerDedupKeys(offer) {
  const keys = new Set();
  if (offer?.id) keys.add(`id:${offer.id}`);
  const url = normalizedUrl(offer?.url);
  if (url) keys.add(`url:${url}`);
  const title = normalizedText(offer?.title);
  const image = normalizedUrl(offer?.image);
  const shop = normalizedText(offer?.shop);
  if (title && image) keys.add(`produto:${title}|${image}`);
  else if (title && shop) keys.add(`produto:${title}|loja:${shop}`);
  else if (title) keys.add(`produto:${title}`);
  return [...keys];
}

export function offerAlreadySeen(offer, seenKeys) {
  return offerDedupKeys(offer).some(key => seenKeys.has(key));
}

// Família editorial usada para alternar o tipo de produto enviado a cada
// grupo. Não é uma categoria da Shopee e não altera a elegibilidade do item.
export function offerVarietyGroup(offer) {
  const title = normalizedText(offer?.title);
  const contains = value => title.includes(value);
  if (contains('conjunto lingerie')) return 'lingerie-conjunto';
  if (contains('sutia')) return 'lingerie-sutia';
  if (contains('calcinha')) return 'lingerie-calcinha';
  if (contains('camisola') || contains('baby doll') || contains('babydoll')) return 'lingerie-noite';
  if (contains('lingerie') || contains('body renda')) return 'lingerie';
  if (contains('vestido')) return 'roupa-vestido';
  if (contains('conjunto')) return 'roupa-conjunto';
  if (contains('blusa') || contains('cropped')) return 'roupa-blusa';
  if (contains('calca') || contains('pantalona')) return 'roupa-calca';
  if (contains('short')) return 'roupa-short';
  if (contains('saia')) return 'roupa-saia';
  if (contains('tenis')) return 'calcado-tenis';
  if (contains('sapatilha')) return 'calcado-sapatilha';
  if (contains('rasteirinha')) return 'calcado-rasteirinha';
  if (contains('tamanco') || contains('slide')) return 'calcado-tamanco-slide';
  if (contains('scarpin') || contains('salto')) return 'calcado-salto';
  return `produto-${title.split(' ').slice(0, 2).join('-') || 'geral'}`;
}

export function uniqueOffers(offers) {
  const seen = new Set();
  return offers.filter(offer => {
    if (offerAlreadySeen(offer, seen)) return false;
    offerDedupKeys(offer).forEach(key => seen.add(key));
    return true;
  });
}

export function activeFlashOffer(offer, now = Date.now()) {
  if (!offer.flash) return false;
  return (!offer.flashStartsAt || offer.flashStartsAt <= now) && (!offer.flashEndsAt || offer.flashEndsAt > now);
}

// A lista de produtos informa o início e o fim da oferta. Só classificamos
// como relâmpago quando a janela é curta (até 24h) e está efetivamente ativa;
// assim uma campanha longa não recebe um rótulo enganoso.
export function markTimeLimitedFlash(offer, now = Date.now()) {
  const start = offer.flashStartsAt;
  const end = offer.flashEndsAt;
  const maxWindow = 24 * 60 * 60 * 1000;
  const active = (!start || start <= now) && end && end > now;
  const shortWindow = start && end > start && end - start <= maxWindow;
  return active && shortWindow ? { ...offer, flash: true } : offer;
}

export function selectOffers(offers, filters, sentIds, recentVarietyGroups = []) {
  const preferredMaxPrice = Number(filters.preferredMaxPrice || 0);
  const priceTier = offer => preferredMaxPrice > 0 && offer.price <= preferredMaxPrice ? 0 : 1;
  const ranked = offers
    .filter(offer => !offerAlreadySeen(offer, sentIds))
    // Algumas listas da Shopee não retornam preço anterior/desconto. Não as descartamos
    // apenas por esse campo não existir; quando há desconto informado, o filtro é aplicado.
    .filter(offer => offer.discount === null || offer.discount >= filters.minDiscount)
    .filter(offer => offer.price >= filters.minPrice && offer.price <= filters.maxPrice)
    .sort((a, b) => priceTier(a) - priceTier(b) || b.commissionRate - a.commissionRate || b.rating - a.rating || b.sales - a.sales || a.price - b.price || (b.discount || 0) - (a.discount || 0));
  const recent = new Set(recentVarietyGroups.filter(Boolean));
  const alternatives = ranked.filter(offer => !recent.has(offerVarietyGroup(offer)));
  // Caso não exista outra família elegível, mantém o catálogo funcionando
  // sem enviar um item repetido ou travar a programação do grupo.
  const ordered = [...alternatives, ...ranked.filter(offer => recent.has(offerVarietyGroup(offer)))];
  return ordered.slice(0, filters.maxOffers);
}

const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function formatOffer(offer, campaign = null) {
  const before = offer.originalPrice > offer.price ? `~De: ${brl(offer.originalPrice)}~` : '';
  const discount = offer.discount ? `😱🔻 *${offer.discount}% DE DESCONTO*` : '💥 *OFERTA ESPECIAL*';
  const couponLine = offer.couponCode ? `🏷️ *USE O CUPOM:* \`${offer.couponCode}\`` : '';
  const campaignLabel = offer.campaignLabel || campaign?.label;
  const campaignLine = campaignLabel ? `🏷️ *${campaignLabel}*` : '';
  const endsAt = offer.flashEndsAt ? new Date(offer.flashEndsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const flashHeader = offer.flash
    ? `⚡ *OFERTA RELÂMPAGO SHOPEE*${endsAt ? ` — *Válida até ${endsAt}*` : ''}`
    : '';
  const priceBlock = [discount, before, `💥 *Por: ${brl(offer.price)}*`].filter(Boolean).join('\n');
  return [
    'ESSE ACHADO É PRA VOCÊ MESMA 🎯✨👇',
    flashHeader,
    `🛍️ *QUEIMA DE ESTOQUE!!!* ${offer.title}`,
    priceBlock,
    couponLine,
    campaignLine,
    `🛒 *Compre aqui:* ${offer.url}`,
    '⚠️ *Promoção sujeita à alteração de preço e estoque do site.*'
  ].filter(Boolean).join('\n\n');
}
