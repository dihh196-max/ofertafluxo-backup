const schedule = [
  { id: 'monday-poll', day: 1, hour: 8, minute: 10, type: 'enquete', label: 'Enquete de preferências' },
  { id: 'tuesday-savings', day: 2, hour: 12, minute: 30, type: 'alerta', label: 'Alerta para economizar' },
  { id: 'wednesday-guide', day: 3, hour: 18, minute: 10, type: 'dica', label: 'Guia de compra inteligente' },
  { id: 'thursday-poll', day: 4, hour: 12, minute: 30, type: 'enquete', label: 'Enquete de categorias' },
  { id: 'friday-flash', day: 5, hour: 8, minute: 10, type: 'alerta', label: 'Alerta de ofertas relâmpago' },
  { id: 'saturday-guide', day: 6, hour: 10, minute: 0, type: 'dica', label: 'Dica de compra do fim de semana' },
  { id: 'sunday-poll', day: 0, hour: 18, minute: 0, type: 'enquete', label: 'Enquete para a próxima semana' }
];

const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const weekDayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(now, timeZone) {
  const output = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { ...output, dayIndex: weekDayIndex[output.weekday] };
}

export function weeklyCommunityCalendar() {
  return schedule.map(item => ({ ...item, weekday: weekdays[item.day], time: `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}` }));
}

export function communitySlotDue(now = new Date(), timeZone = 'America/Cuiaba') {
  const parts = localParts(now, timeZone);
  const item = schedule.find(slot => slot.day === parts.dayIndex && slot.hour === Number(parts.hour));
  if (!item || Number(parts.minute) < item.minute) return null;
  return { ...item, key: `${parts.year}-${parts.month}-${parts.day}:${item.id}` };
}

export function hasPendingCommunityContent(state, destinations, now = new Date(), timeZone = 'America/Cuiaba') {
  const slot = communitySlotDue(now, timeZone);
  if (!slot) return null;
  const sentSlots = state?.sentSlots || {};
  const retryAt = Date.parse(state?.retryAfter?.[slot.key] || '');
  if (Number.isFinite(retryAt) && retryAt > now.getTime()) return null;
  const eligible = (destinations || []).filter(destination => destination.active && destination.consent === true);
  return eligible.some(destination => !sentSlots[`${slot.key}:${destination.id}`]) ? slot : null;
}

export function formatCommunityContent(slot) {
  const messages = {
    'monday-poll': '📊 *ENQUETE DA SEMANA*\nQual tipo de achado você quer ver mais aqui?\n\n1️⃣ Moda feminina\n2️⃣ Casa e utilidades\n3️⃣ Beleza e cuidados pessoais\n4️⃣ Ferramentas e churrasco\n\nResponda somente com o número 👇',
    'tuesday-savings': '🏷️ *ALERTA PARA ECONOMIZAR*\nAntes de finalizar uma compra, confira os cupons disponíveis no carrinho e as opções de frete. Eles podem mudar conforme a conta, a região e o produto.\n\nAs próximas ofertas do grupo continuam chegando por aqui. ✨',
    'wednesday-guide': '✨ *DICA DE COMPRA INTELIGENTE*\nCompare preço, avaliação, prazo de entrega e variações antes de fechar o pedido. Uma oferta boa é aquela que realmente faz sentido para você.\n\nFique de olho nos próximos achados 👀',
    'thursday-poll': '🗳️ *ENQUETE RÁPIDA*\nPara o próximo achado, o que você prefere?\n\n1️⃣ Produto barato para o dia a dia\n2️⃣ Item para casa\n3️⃣ Moda\n4️⃣ Oferta para presente\n\nVote com o número nos comentários 👇',
    'friday-flash': '⚡ *ALERTA DE OFERTAS RELÂMPAGO*\nSexta é um bom dia para acompanhar os preços: promoções e estoque podem mudar rápido. Se encontrar um achado que gostou, confira o valor final antes de concluir a compra.\n\nVamos avisar quando houver ofertas qualificadas. 🔥',
    'saturday-guide': '🛒 *DICA DE FIM DE SEMANA*\nSalve os itens que você gostou e compare as condições no carrinho antes de comprar. Assim fica mais fácil aproveitar uma queda real de preço.\n\nBom fim de semana! ✨',
    'sunday-poll': '📌 *PLANEJANDO A PRÓXIMA SEMANA*\nQual categoria merece prioridade nos próximos achados?\n\n1️⃣ Casa e utilidades\n2️⃣ Moda feminina\n3️⃣ Beleza\n4️⃣ Ferramentas\n\nDeixe seu voto com o número 👇'
  };
  return messages[slot.id] || '✨ Continue acompanhando o grupo para receber os próximos achados selecionados.';
}
