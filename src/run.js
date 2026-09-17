import { getShopeeOffers } from './shopee.js';
import { formatOffer, markTimeLimitedFlash, normalizeOffers, selectOffers, uniqueOffers } from './offers.js';
import { readRecentVarietyGroups, readSentIds, rememberSent } from './store.js';
import { sendWhatsAppOffer } from './whatsapp.js';
import { sendEvolutionOffer } from './evolution.js';
import { sendDirectWhatsAppOffer } from './whatsapp-direct.js';
import { categoryById, matchesCategory } from './categories.js';
import { currentShopeeCampaign } from './campaigns.js';
import { automationWindowOpen, confirmDelivery, failDelivery, queueDelivery, reserveDelivery } from './safety.js';

export async function run(settings, destinationIds = null) {
  const seenDestinations = new Set();
  const activeDestinations = (settings.destinations || []).filter(destination => {
    if (!destination.active || seenDestinations.has(destination.number)) return false;
    seenDestinations.add(destination.number);
    return true;
  });
  const destinations = activeDestinations.filter(destination => destination.consent === true && (!destinationIds || destinationIds.includes(destination.id)));
  if (!destinations.length) throw new Error('Adicione um destino ativo e confirme que ele autorizou receber ofertas.');
  if (settings.origin === 'automático' && !automationWindowOpen(settings.safety)) {
    return { found: 0, offers: [], errors: [], skipped: 'Envio automático pausado pelo horário de segurança.' };
  }

  // A busca geral da API traz uma seleção mais estável que o campo "keyword".
  // Ela é usada primeiro; uma busca específica só entra como reserva quando a
  // lista geral não tiver nenhum produto daquela categoria.
  const rawOffers = getShopeeOffers(settings.shopee);
  const fallbackByCategory = new Map();
  const offersForCategory = async category => {
    const general = normalizeOffers(await rawOffers).filter(offer => matchesCategory(offer, category));
    if (category.searchQueries?.length) {
      if (!fallbackByCategory.has(category.id)) {
        fallbackByCategory.set(category.id, Promise.all(category.searchQueries.map(keyword => getShopeeOffers(settings.shopee, { keyword }))));
      }
      const specific = (await fallbackByCategory.get(category.id)).flatMap(normalizeOffers).filter(offer => matchesCategory(offer, category));
      return uniqueOffers([...specific, ...general]);
    }
    if (general.length || !category.query) return general;
    if (!fallbackByCategory.has(category.id)) {
      fallbackByCategory.set(category.id, getShopeeOffers(settings.shopee, { keyword: category.query }));
    }
    return normalizeOffers(await fallbackByCategory.get(category.id)).filter(offer => matchesCategory(offer, category));
  };
  const campaign = currentShopeeCampaign();
  const jobs = destinations.map(async destination => {
    const category = categoryById(destination.categoryId);
    const sentIds = readSentIds(settings.userId, destination.id);
    const recentVarietyGroups = readRecentVarietyGroups(settings.userId, destination.id);
    // Os horários oficiais do próprio produto são a única fonte usada para
    // marcar uma oferta relâmpago. A API de campanhas é uma landing page e
    // não fornece preço por item, portanto não é usada para inventar preços.
    let categorizedOffers = (await offersForCategory(category)).map(markTimeLimitedFlash);
    const flashOffers = categorizedOffers.filter(item => item.flash);
    const flashIds = new Set(flashOffers.map(item => item.id));
    const normalOffers = categorizedOffers.filter(item => !flashIds.has(item.id));
    const preferredKind = destination.nextOfferKind === 'normal' ? 'normal' : 'flash';
    const pick = list => selectOffers(list, { ...settings.filters, maxOffers: 1 }, sentIds, recentVarietyGroups)[0];
    // A alternância é por grupo. Se não existir relâmpago válida no nicho,
    // envia a normal disponível e tenta uma relâmpago novamente na próxima vez.
    const preferred = preferredKind === 'flash' ? flashOffers : normalOffers;
    const fallback = preferredKind === 'flash' ? normalOffers : flashOffers;
    let offer = pick(preferred) || pick(fallback);
    // Só quando a primeira coleta não tiver um item novo, consulta a próxima
    // página dos mesmos termos. Isso amplia variedade sem multiplicar a carga
    // normal da automação nem fazer disparos em massa.
    if (!offer && category.searchQueries?.length) {
      const pageTwo = await Promise.all(category.searchQueries.map(keyword => getShopeeOffers(settings.shopee, { keyword, page: 2, limit: 50 })));
      const extra = pageTwo.flatMap(normalizeOffers).filter(item => matchesCategory(item, category));
      categorizedOffers = uniqueOffers([...categorizedOffers, ...extra]).map(markTimeLimitedFlash);
      const extraFlash = categorizedOffers.filter(item => item.flash);
      const extraFlashIds = new Set(extraFlash.map(item => item.id));
      const extraNormal = categorizedOffers.filter(item => !extraFlashIds.has(item.id));
      offer = pick(preferredKind === 'flash' ? extraFlash : extraNormal)
        || pick(preferredKind === 'flash' ? extraNormal : extraFlash);
    }
    if (!offer) return null;
    const text = formatOffer(offer, campaign);
    const reservation = reserveDelivery(settings.userId, destination, settings.safety);
    try {
      await queueDelivery(async () => {
        if (settings.directWhatsApp?.enabled) return sendDirectWhatsAppOffer(settings.userId, offer, text, [destination.number]);
        if (settings.evolution?.enabled) return sendEvolutionOffer(text, { ...settings.evolution, targets: [destination.number] });
        return sendWhatsAppOffer(text, { ...settings.whatsapp, recipients: [destination.number] });
      }, settings.safety);
      confirmDelivery(settings.userId, reservation, offer);
    } catch (error) {
      failDelivery(settings.userId, reservation, error);
      throw error;
    }
    return { offer, offerKind: offer.flash ? 'flash' : 'normal', destinationId: destination.id, destinationName: destination.name, categoryId: category.id, category: category.label };
  });
  const settled = await Promise.allSettled(jobs);
  const sent = settled.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
  const errors = settled.filter(result => result.status === 'rejected').map(result => result.reason?.message || 'Falha ao enviar');
  if (sent.length) rememberSent(settings.userId, sent);
  if (errors.length && !sent.length) {
    throw new Error(errors.join(' | '));
  }
  return {
    found: sent.length,
    campaign: campaign?.label || null,
    errors,
    offers: sent.map(({ offer, offerKind, destinationName, category }) => ({ id: offer.id, title: offer.title, price: offer.price, discount: offer.discount, offerKind, destinationName, category }))
  };
}
