import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFlashOffer, formatOffer, markTimeLimitedFlash, normalizeOffers, selectOffers, uniqueOffers } from '../src/offers.js';
import { categoryById, matchesCategory } from '../src/categories.js';
import { automationWindowOpen, normalizeSafety } from '../src/safety.js';
import { createDestinationSchedule, nextDueDestination, scheduleAfterRun } from '../src/automation-schedule.js';

test('normaliza e seleciona apenas uma oferta nova que atende aos filtros', () => {
  const offers = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 1, productName: 'Fone', productLink: 'https://s.shopee.com.br/x', price: 50, originalPrice: 100 },
    { itemId: 2, productName: 'Cabo', productLink: 'https://s.shopee.com.br/y', price: 10, originalPrice: 12 }
  ] } });
  const selected = selectOffers(offers, { minDiscount: 20, minPrice: 20, maxPrice: 80, maxOffers: 5 }, new Set());
  assert.equal(selected.length, 1);
  assert.match(formatOffer(selected[0]), /50% DE DESCONTO/);
});

test('não repete o mesmo produto quando a Shopee devolve IDs ou links diferentes', () => {
  const common = { title: 'Kit 3 Vestidos Midi Canelado', image: 'https://cf.shopee.com.br/file/vestido.jpg?cache=1', price: 60, originalPrice: 100, discount: 40, commissionRate: 0.1, rating: 5, sales: 4 };
  const offers = uniqueOffers([
    { ...common, id: 'id-campanha', url: 'https://s.shopee.com.br/link-da-campanha' },
    { ...common, id: 'id-variacao', url: 'https://s.shopee.com.br/outro-link-afiliado' },
    { ...common, id: 'calca-distinta', title: 'Calça Pantalona Feminina', image: 'https://cf.shopee.com.br/file/calca.jpg', url: 'https://s.shopee.com.br/calca' }
  ]);
  assert.equal(offers.length, 2);
  const alreadySent = new Set(['produto:kit 3 vestidos midi canelado|cf.shopee.com.br/file/vestido.jpg']);
  assert.equal(selectOffers(offers, { minDiscount: 10, minPrice: 0, maxPrice: 200, maxOffers: 5 }, alreadySent).length, 1);
});

test('usa o desconto e o cupom apenas quando esses dados vierem da Shopee', () => {
  const [offer] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 5, productName: 'Blusa', offerLink: 'https://s.shopee.com.br/c', priceMin: 39.9, priceDiscountRate: 35, couponCode: 'GANHE10' }
  ] } });
  assert.equal(offer.discount, 35);
  assert.equal(offer.couponCode, 'GANHE10');
  assert.match(formatOffer(offer), /35% DE DESCONTO/);
  assert.match(formatOffer(offer), /USE O CUPOM:.*GANHE10/);
});

test('exibe preço anterior riscado ao receber percentual oficial de desconto', () => {
  const [offer] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 6, productName: 'Conjunto', offerLink: 'https://s.shopee.com.br/d', price: 70, priceDiscountRate: 30 }
  ] } });
  assert.equal(offer.originalPrice, 100);
  assert.match(formatOffer(offer), /~De: R\$\s?100,00~/);
  assert.match(formatOffer(offer), /Por: R\$\s?70,00/);
  assert.match(formatOffer(offer), /ESSE ACHADO É PRA VOCÊ MESMA/);
  assert.match(formatOffer(offer), /Compre aqui:/);
  assert.match(formatOffer(offer), /ESSE ACHADO É PRA VOCÊ MESMA[^]*\n\n🛍️/);
  assert.match(formatOffer(offer), /Por: R\$\s?70,00[^]*\n\n🛒/);
});

test('destaca oferta relâmpago ativa com a validade fornecida pela Shopee', () => {
  const [offer] = normalizeOffers({ shopeeOfferV2: { nodes: [
    { itemId: 7, productName: 'Vestido', offerLink: 'https://s.shopee.com.br/flash', price: 59.9, priceDiscountRate: 40, offerName: 'Flash Sale', periodEndTime: 1_900_000_000 }
  ] } }, { flash: true });
  assert.equal(activeFlashOffer(offer, Date.parse('2026-08-25T00:00:00Z')), true);
  assert.match(formatOffer(offer), /OFERTA RELÂMPAGO SHOPEE/);
  assert.match(formatOffer(offer), /Válida até/);
});

test('classifica como relâmpago apenas uma janela curta e ativa informada no produto', () => {
  const [offer] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 8, productName: 'Short', offerLink: 'https://s.shopee.com.br/flash-short', price: 29.9, periodStartTime: 1_788_048_000, periodEndTime: 1_788_091_200 }
  ] } });
  const flash = markTimeLimitedFlash(offer, 1_788_060_000_000);
  assert.equal(flash.flash, true);
  const longCampaign = markTimeLimitedFlash({ ...offer, flashStartsAt: 1_788_048_000_000, flashEndsAt: 1_788_048_000_000 + 48 * 60 * 60_000 }, 1_788_050_000_000);
  assert.equal(longCampaign.flash, false);
});

test('prioriza comissão e reconhece categorias sem confundir palavras parciais', () => {
  const offers = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 1, productName: 'Fone bluetooth premium', offerLink: 'https://s.shopee.com.br/a', price: 80, commissionRate: 0.2, ratingStar: 4.9 },
    { itemId: 2, productName: 'Carregador portátil', offerLink: 'https://s.shopee.com.br/b', price: 60, commissionRate: 0.4, ratingStar: 4.2 },
    { itemId: 3, productName: 'Jaqueta de camada dupla', offerLink: 'https://s.shopee.com.br/c', price: 90, commissionRate: 0.7, ratingStar: 5 }
  ] } });
  const selected = selectOffers(offers, { minDiscount: 0, minPrice: 0, maxPrice: 100, maxOffers: 3 }, new Set());
  assert.equal(selected[0].id, '3');
  assert.equal(matchesCategory(selected[0], categoryById('home')), false);
  assert.equal(matchesCategory(offers[0], categoryById('tech')), true);
});

test('separa acessórios, moda masculina e moda feminina', () => {
  const [accessory, male, female] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 10, productName: 'Bolsa transversal com alça', offerLink: 'https://s.shopee.com.br/10', price: 40 },
    { itemId: 11, productName: 'Camisa social masculina slim', offerLink: 'https://s.shopee.com.br/11', price: 70 },
    { itemId: 12, productName: 'Vestido feminino midi', offerLink: 'https://s.shopee.com.br/12', price: 90 }
  ] } });
  assert.equal(matchesCategory(accessory, categoryById('fashion-accessories')), true);
  assert.equal(matchesCategory(male, categoryById('fashion-men')), true);
  assert.equal(matchesCategory(female, categoryById('fashion-women')), true);
  assert.equal(matchesCategory(female, categoryById('fashion-men')), false);
});

test('segmenta ferramentas e churrasco sem misturar brinquedos', () => {
  const [furadeira, churrasqueira, brinquedo] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 13, productName: 'Furadeira e parafusadeira sem fio', offerLink: 'https://s.shopee.com.br/13', price: 120 },
    { itemId: 14, productName: 'Kit churrasco com faca e garfo', offerLink: 'https://s.shopee.com.br/14', price: 55 },
    { itemId: 15, productName: 'Brinquedo miniatura kit ferramentas infantil', offerLink: 'https://s.shopee.com.br/15', price: 25 }
  ] } });
  const category = categoryById('tools-bbq');
  assert.equal(matchesCategory(furadeira, category), true);
  assert.equal(matchesCategory(churrasqueira, category), true);
  assert.equal(matchesCategory(brinquedo, category), false);
});

test('moda feminina aceita roupas e exclui bolsas e calçados', () => {
  const [dress, bag, sneakers] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 20, productName: 'Vestido feminino midi', offerLink: 'https://s.shopee.com.br/20', price: 90 },
    { itemId: 21, productName: 'Bolsa feminina transversal', offerLink: 'https://s.shopee.com.br/21', price: 60 },
    { itemId: 22, productName: 'Tênis feminino casual', offerLink: 'https://s.shopee.com.br/22', price: 110 }
  ] } });
  const category = categoryById('fashion-women');
  assert.equal(matchesCategory(dress, category), true);
  assert.equal(matchesCategory(bag, category), false);
  assert.equal(matchesCategory(sneakers, category), false);
});

test('moda íntima encontra lingeries e sutiãs sem misturar produtos masculinos ou infantis', () => {
  const [lingerie, sutia, cueca, infantil] = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 31, productName: 'Conjunto lingerie feminina em renda', offerLink: 'https://s.shopee.com.br/31', price: 59 },
    { itemId: 32, productName: 'Sutiã feminino sem bojo', offerLink: 'https://s.shopee.com.br/32', price: 42 },
    { itemId: 33, productName: 'Cueca masculina kit algodão', offerLink: 'https://s.shopee.com.br/33', price: 39 },
    { itemId: 34, productName: 'Lingerie infantil fantasia', offerLink: 'https://s.shopee.com.br/34', price: 25 }
  ] } });
  const category = categoryById('fashion-intimates');
  assert.equal(matchesCategory(lingerie, category), true);
  assert.equal(matchesCategory(sutia, category), true);
  assert.equal(matchesCategory(cueca, category), false);
  assert.equal(matchesCategory(infantil, category), false);
});

test('aplica janela de descanso e limites conservadores de segurança', () => {
  const safety = normalizeSafety({ maxPerHour: 999, maxPerDay: -1, quietStartHour: 22, quietEndHour: 8 });
  assert.equal(safety.maxPerHour, 20);
  assert.equal(safety.maxPerDay, 1);
  assert.equal(automationWindowOpen(safety, new Date('2026-08-24T03:00:00-04:00')), false);
  assert.equal(automationWindowOpen(safety, new Date('2026-08-24T10:00:00-04:00')), true);
});

test('prioriza preço acessível antes de comissão entre ofertas válidas', () => {
  const offers = normalizeOffers({ productOfferV2: { nodes: [
    { itemId: 30, productName: 'Produto caro', offerLink: 'https://s.shopee.com.br/30', price: 180, commissionRate: 0.8, ratingStar: 5 },
    { itemId: 31, productName: 'Produto acessível', offerLink: 'https://s.shopee.com.br/31', price: 45, commissionRate: 0.2, ratingStar: 4.8 }
  ] } });
  const selected = selectOffers(offers, { minDiscount: 0, minPrice: 0, maxPrice: 500, maxOffers: 2, preferredMaxPrice: 80 }, new Set());
  assert.equal(selected[0].id, '31');
});

test('intercala a automação entre grupos, sem envio simultâneo', () => {
  const groups = [
    { id: 'a', active: true, consent: true, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', active: true, consent: true, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c', active: true, consent: true, createdAt: '2026-01-03T00:00:00.000Z' }
  ];
  const start = Date.parse('2026-08-24T12:00:00.000Z');
  const schedule = createDestinationSchedule(groups, 60, start);
  assert.equal(Date.parse(schedule.b.nextRunAt) - Date.parse(schedule.a.nextRunAt), 20 * 60_000);
  assert.equal(nextDueDestination(groups, schedule, start + 20 * 60_000).id, 'a');
  const advanced = scheduleAfterRun(schedule, 'a', groups, 60, start + 20 * 60_000);
  assert.equal(Date.parse(advanced.a.nextRunAt) - (start + 20 * 60_000), 60 * 60_000);
});
