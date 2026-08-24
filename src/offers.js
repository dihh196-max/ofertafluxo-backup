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

export function normalizeOffers(data) {
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
      sales: number(raw.sales ?? raw.sold ?? raw.soldCount),
      shop: raw.shopName,
      commission: raw.commission,
      commissionRate: number(raw.commissionRate),
      rating: number(raw.ratingStar),
      couponCode: couponFrom(raw)
    };
  }).filter(offer => offer.id && offer.url && offer.price > 0);
}

export function selectOffers(offers, filters, sentIds) {
  const preferredMaxPrice = Number(filters.preferredMaxPrice || 0);
  const priceTier = offer => preferredMaxPrice > 0 && offer.price <= preferredMaxPrice ? 0 : 1;
  return offers
    .filter(offer => !sentIds.has(offer.id))
    // Algumas listas da Shopee não retornam preço anterior/desconto. Não as descartamos
    // apenas por esse campo não existir; quando há desconto informado, o filtro é aplicado.
    .filter(offer => offer.discount === null || offer.discount >= filters.minDiscount)
    .filter(offer => offer.price >= filters.minPrice && offer.price <= filters.maxPrice)
    .sort((a, b) => priceTier(a) - priceTier(b) || b.commissionRate - a.commissionRate || b.rating - a.rating || b.sales - a.sales || a.price - b.price || (b.discount || 0) - (a.discount || 0))
    .slice(0, filters.maxOffers);
}

const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function formatOffer(offer, campaign = null) {
  const before = offer.originalPrice > offer.price ? `\n~De: ${brl(offer.originalPrice)}~` : '';
  const discount = offer.discount ? `🔥 *${offer.discount}% OFF*\n` : '💥 *OFERTA ESPECIAL*\n';
  const savings = offer.originalPrice > offer.price ? `💰 Economia de ${brl(offer.originalPrice - offer.price)}\n` : '';
  const couponLine = offer.couponCode ? `\n🏷️ *USE O CUPOM:* \`${offer.couponCode}\`\n` : '';
  const campaignLine = campaign ? `\n🏷️ *${campaign.label}*` : '';
  return `🛍️ *${offer.title}*${before}\n\n${discount}${savings}❤️ *POR ${brl(offer.price)}*${couponLine}${campaignLine}\n\n🛒 *LINK PROMOCIONAL:* ${offer.url}\n\n⚠️ *Promoção sujeita à alteração de preço e estoque no site.*`;
}
