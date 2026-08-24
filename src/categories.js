const definitions = [
  ['all', 'Ofertas gerais', '', []],
  ['tech', 'Tecnologia e eletrônicos', 'fone bluetooth', ['fone', 'bluetooth', 'celular', 'smartphone', 'notebook', 'tv', 'monitor', 'teclado', 'mouse', 'carregador', 'câmera', 'camera', 'smartwatch', 'caixa de som'], [], ['fone bluetooth', 'carregador', 'smartwatch', 'caixa de som', 'teclado gamer']],
  ['home', 'Casa, cozinha e decoração', 'cozinha', ['cama', 'mesa', 'banho', 'cozinha', 'panela', 'toalha', 'tapete', 'organizador', 'colcha', 'manta', 'decoração', 'decoracao', 'pote', 'lençol', 'lencol'], [], ['cozinha', 'organizador casa', 'cama mesa banho', 'panela', 'decoração casa']],
  ['fashion-accessories', 'Acessórios de moda', 'bolsa feminina', ['bolsa', 'brinco', 'colar', 'pulseira', 'anel', 'relógio', 'relogio', 'óculos', 'oculos', 'bone', 'boné', 'cinto', 'carteira', 'mochila', 'chapéu', 'chapeu', 'acessório', 'acessorio'], ['vestido', 'blusa', 'calça', 'calca', 'shorts', 'conjunto'], ['bolsa feminina', 'brinco feminino', 'colar feminino', 'relógio feminino', 'óculos de sol']],
  ['fashion-men', 'Moda masculina — roupas', 'camisa masculina', ['masculino', 'masculina', 'camisa masculina', 'camiseta masculina', 'bermuda', 'short masculino', 'shorts masculino', 'calça masculina', 'calca masculina', 'conjunto masculino', 'cueca', 'polo masculina', 'jaqueta masculina', 'casaco masculino'], ['tenis', 'tênis', 'sapato', 'chinelo', 'bota', 'relógio', 'relogio', 'boné', 'bone', 'cinto', 'carteira', 'bolsa'], ['camisa masculina', 'short masculino', 'bermuda masculina', 'conjunto masculino', 'calça masculina']],
  ['fashion-women', 'Moda feminina — roupas', 'vestido feminino', ['vestido', 'vestidos', 'short', 'shorts', 'conjunto', 'conjuntos', 'blusa', 'blusas', 'cropped', 'croppeds', 'calça', 'calcas', 'saia', 'saias', 'macacão', 'macacao', 'macaquinho', 'camisa feminina', 'camiseta feminina', 'pijama', 'jaqueta feminina', 'casaco feminino', 'cardigan', 'body feminino', 'top feminino'], ['bolsa', 'tenis', 'tênis', 'sapato', 'sandália', 'sandalia', 'chinelo', 'salto', 'bota', 'carteira', 'óculos', 'oculos', 'brinco', 'colar'], ['vestido feminino', 'short feminino', 'conjunto feminino', 'blusa feminina', 'calça feminina']],
  ['beauty', 'Beleza e perfumaria', 'maquiagem', ['perfume', 'maquiagem', 'skincare', 'body splash', 'cabelo', 'cosmético', 'cosmetico', 'hidratante', 'beleza', 'shampoo'], [], ['maquiagem', 'perfume feminino', 'skincare', 'hidratante', 'produtos cabelo']],
  ['kids', 'Bebês e infantil', 'brinquedo infantil', ['bebê', 'bebe', 'infantil', 'criança', 'crianca', 'brinquedo', 'fralda', 'mamadeira', 'maternidade'], [], ['brinquedo infantil', 'roupa infantil', 'fralda bebê', 'maternidade', 'mamadeira']],
  ['health', 'Saúde e bem-estar', 'massageador', ['massageador', 'suplemento', 'fitness', 'academia', 'saúde', 'saude', 'ortopédico', 'ortopedico', 'exercício', 'exercicio'], [], ['massageador', 'fitness academia', 'suplemento', 'ortopédico', 'bem estar']],
  ['pets', 'Pets', 'pet cachorro', ['pet', 'cachorro', 'gato', 'ração', 'racao', 'comedouro', 'coleira', 'areia gato'], [], ['pet cachorro', 'pet gato', 'coleira cachorro', 'comedouro pet', 'areia gato']],
  ['auto', 'Automotivo', 'automotivo', ['carro', 'moto', 'automotivo', 'veículo', 'veiculo', 'capacete', 'farol', 'retrovisor'], [], ['automotivo', 'acessório carro', 'acessorio carro', 'moto capacete', 'som automotivo']],
  ['games', 'Games e entretenimento', 'gamer', ['game', 'gamer', 'console', 'jogo', 'controle', 'headset gamer', 'playstation', 'xbox'], [], ['gamer', 'controle gamer', 'jogo console', 'headset gamer', 'playstation']],
  ['food', 'Mercado e alimentos', 'café', ['café', 'cafe', 'chocolate', 'alimento', 'suplemento', 'bebida', 'lanche', 'mercado'], [], ['café', 'chocolate', 'alimentos', 'bebida', 'lanche']]
];
export const categories = definitions.map(([id, label, query, keywords, excludedKeywords = [], searchQueries = []]) => ({ id, label, query, keywords, excludedKeywords, searchQueries }));
export function categoryById(id) {
  // Categoria usada nas versões anteriores do painel: preserva o grupo já
  // configurado, direcionando-o para Moda feminina até o usuário escolher uma
  // das três novas segmentações.
  if (id === 'fashion') return categories.find(item => item.id === 'fashion-women');
  return categories.find(item => item.id === id) || categories[0];
}
export function matchesCategory(offer, category) {
  if (!category.keywords.length) return true;
  const normalize = value => ` ${String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const text = normalize(`${offer.title} ${offer.shop || ''}`);
  if (category.excludedKeywords?.some(keyword => text.includes(normalize(keyword)))) return false;
  return category.keywords.some(keyword => text.includes(normalize(keyword)));
}
