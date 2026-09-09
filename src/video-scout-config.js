const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export const VIDEO_STATUSES = ['NOVO', 'SELECIONADO', 'EM_CRIACAO', 'VIDEO_CRIADO', 'PUBLICADO', 'IGNORADO', 'FORA_DO_CRITERIO'];

// Consultas amplas para percorrer as famílias de Casa e Utilidades. Elas guiam
// a paginação da Open API, mas não são um filtro de reprovação do produto.
export const homeAndUtilitiesSearchTerms = [
  'casa e decoração', 'utilidades domésticas', 'cozinha', 'organização casa',
  'limpeza doméstica', 'banheiro', 'lavanderia', 'quarto', 'sala decoração',
  'ferramentas', 'eletrodomésticos', 'eletroportáteis', 'iluminação', 'jardim'
];

// Categorias de consulta do Video Scout. Cada uma tem termos diferentes para
// ampliar a descoberta, sem usar os termos como bloqueio de elegibilidade.
export const videoScoutCategories = [
  { id: 'kitchen', label: 'Cozinha e utensílios', terms: ['utensílios cozinha', 'acessórios cozinha', 'organizador cozinha', 'gadget cozinha', 'cozinha prática'] },
  { id: 'organization', label: 'Organização e utilidades', terms: ['organização casa', 'organizador doméstico', 'utilidades domésticas', 'organizador multiuso', 'casa inteligente'] },
  { id: 'cleaning', label: 'Limpeza e lavanderia', terms: ['limpeza doméstica', 'lavanderia', 'acessórios limpeza', 'gadget limpeza', 'organizador lavanderia'] },
  { id: 'bathroom', label: 'Banheiro', terms: ['utilidades banheiro', 'organizador banheiro', 'acessórios banheiro', 'dispenser banheiro'] },
  { id: 'bedroom', label: 'Quarto e cama', terms: ['quarto decoração', 'utilidades quarto', 'organizador quarto', 'cama prática'] },
  { id: 'decor', label: 'Decoração e iluminação', terms: ['casa e decoração', 'iluminação decorativa', 'sala decoração', 'decoração funcional', 'luminária moderna'] },
  { id: 'tools-garden', label: 'Ferramentas e jardim', terms: ['ferramentas', 'utilidades jardim', 'jardinagem', 'ferramenta multifuncional', 'casa manutenção'] },
  { id: 'appliances', label: 'Eletrodomésticos e eletroportáteis', terms: ['eletrodomésticos', 'eletroportáteis', 'eletro casa', 'aparelho cozinha', 'casa elétrica'] },
  // Consultas de vestuário feminino para volume alto, mantendo peças de roupa
  // como foco e evitando termos de bolsas, sapatos e acessórios.
  {
    id: 'womens-clothing',
    label: 'Roupas femininas',
    terms: [
      'vestido feminino', 'vestido midi feminino', 'vestido casual feminino',
      'conjunto feminino', 'conjunto feminino verão', 'conjunto social feminino',
      'blusa feminina', 'cropped feminino', 'short feminino', 'short jeans feminino',
      'calça feminina', 'calça wide leg feminina', 'saia feminina', 'saia midi feminina',
      'macacão feminino', 'macaquinho feminino', 'body feminino', 'moda fitness feminina',
      'pijama feminino', 'moda feminina roupa'
    ],
    includeKeywords: ['vestido', 'conjunto', 'blusa', 'camisa', 'cropped', 'short', 'bermuda', 'calça', 'calca', 'saia', 'macacão', 'macacao', 'body', 'pijama', 'cardigan', 'casaco', 'jaqueta', 'top', 'legging', 'roupa feminina'],
    excludeKeywords: ['bolsa', 'mochila', 'sapato', 'tênis', 'tenis', 'sandália', 'sandalia', 'chinelo', 'sapatilha', 'bota', 'brinco', 'colar', 'pulseira', 'anel', 'óculos', 'oculos']
  }
];

export const winnerSearchTerms = [
  'lençol', 'lençol casal', 'lençol queen', 'lençol king', 'lençol com elástico',
  'lençol 300 fios', 'lençol 400 fios', 'lençol 600 fios', 'jogo de cama',
  'kit cama', 'cobre leito', 'colcha', 'edredom', 'manta', 'fronha',
  'kit fronhas', 'protetor de colchão', 'protetor de travesseiro',
  'saia para cama', 'capa de travesseiro', 'roupa de cama'
];

// Nicho separado do campeão de roupa de cama. Os termos são intencionalmente
// específicos de vestuário, para não misturar brinquedos, calçados ou enxoval.
export const babyClothingSearchTerms = [
  'body bebê', 'body bebe', 'kit body bebê', 'kit body bebe',
  'macacão bebê', 'macacao bebe', 'conjunto bebê roupa', 'conjunto bebe roupa',
  'pijama bebê', 'pijama bebe', 'vestido bebê', 'vestido bebe',
  'short bebê', 'short bebe', 'calça bebê', 'calca bebe',
  'roupa de bebê', 'roupa de bebe', 'kit roupa bebê', 'kit roupa bebe'
];

export const babyClothingKeywords = [
  'body', 'bebe', 'bebê', 'macacao', 'macacão', 'conjunto', 'pijama',
  'vestido', 'short', 'bermuda', 'calca', 'calça', 'camiseta', 'camisa',
  'blusa', 'mijão', 'mijao', 'jardineira', 'saia', 'roupa infantil'
];
export const babyClothingExcludedKeywords = [
  'tenis', 'tênis', 'sandalia', 'sandália', 'sapatinho', 'sapato', 'chinelo',
  'bolsa', 'mochila', 'chupeta', 'mamadeira', 'brinquedo', 'carrinho',
  'fralda', 'banheira', 'cadeirinha', 'enxoval completo'
];

export const viralSearchTerms = [
  'organizador casa', 'organizador cozinha', 'utensílio cozinha', 'dispenser',
  'escova limpeza', 'limpeza doméstica', 'cortador cozinha', 'seladora',
  'lavanderia organizador', 'banheiro organizador', 'acessório cozinha',
  'decoração funcional', 'utilidade doméstica', 'cama quarto'
];

export const visualKeywords = ['elétrico', 'eletrica', 'automático', 'automatico', 'dobrável', 'dobravel', 'giratória', 'giratoria', 'magnético', 'magnetico', 'dispenser', 'seladora', 'cortador', 'pulverizador', 'escova', 'viral', 'tendência', 'tendencia', 'lançamento', 'lancamento', 'novidade'];
export const problemKeywords = ['organizador', 'limpeza', 'sujeira', 'mancha', 'anti', 'economiza', 'prático', 'pratico', 'vazamento', 'desentupidor', 'secagem'];
export const beforeAfterKeywords = ['limpeza', 'mancha', 'organizador', 'organizadora', 'renova', 'transforma', 'remove', 'desengordurante', 'desentupidor'];
export const organizationKeywords = ['organizador', 'gaveta', 'prateleira', 'cabide', 'cesto', 'suporte', 'porta', 'divisória', 'divisoria'];
export const cleaningKeywords = ['limpeza', 'escova', 'vassoura', 'rodo', 'esponja', 'pano', 'desengordurante', 'aspirador'];
export const kitchenKeywords = ['cozinha', 'cortador', 'ralador', 'fatiador', 'dispenser', 'seladora', 'escorredor', 'pote', 'porta tempero'];
export const homeKeywords = [...organizationKeywords, ...cleaningKeywords, ...kitchenKeywords, 'cama', 'lençol', 'lencol', 'colcha', 'edredom', 'manta', 'banheiro', 'lavanderia', 'decoração', 'decoracao', 'doméstico', 'domestico', 'utilidade'];

export const defaultVideoScout = {
  enabled: false,
  intervalMinutes: 60,
  lastRunAt: null,
  scanPage: 1,
  maxSales: 20,
  minCommissionPercent: 10,
  maxCreatorVideos: 0,
  winnerProductName: 'Lençol de cama 400 fios',
  winnerProductId: '',
  winnerProductUrl: '',
  winnerProductCategory: 'Casa / Roupa de cama',
  minShopeeVideoScore: 0,
  minInstagramViralScore: 40,
  preferredPriceMax: 80,
  searchLimit: 50,
  pagesPerTerm: 2,
  maxConcurrentSearches: 3,
  weights: {
    shopee: { similarity: 45, commission: 20, lowSales: 15, rating: 10, value: 10 },
    instagram: { demonstration: 25, problem: 20, curiosity: 15, beforeAfter: 15, value: 10, commission: 10, rating: 5 }
  }
};

export function videoScoutFromEnv(env = process.env) {
  return normalizeVideoScout({
    enabled: env.VIDEO_CANDIDATE_SCAN_ENABLED === 'true',
    intervalMinutes: env.VIDEO_CANDIDATE_SCAN_INTERVAL_MINUTES,
    maxSales: env.MAX_SALES_FOR_VIDEO_CANDIDATE,
    minCommissionPercent: env.MIN_AFFILIATE_COMMISSION_PERCENT,
    maxCreatorVideos: env.MAX_CREATOR_VIDEOS,
    winnerProductName: env.WINNER_PRODUCT_NAME,
    winnerProductId: env.WINNER_PRODUCT_ID,
    winnerProductUrl: env.WINNER_PRODUCT_URL,
    winnerProductCategory: env.WINNER_PRODUCT_CATEGORY,
    minShopeeVideoScore: env.MIN_SHOPEE_VIDEO_SCORE,
    minInstagramViralScore: env.MIN_INSTAGRAM_VIRAL_SCORE,
    preferredPriceMax: env.VIDEO_CANDIDATE_PREFERRED_PRICE_MAX
  });
}

export function normalizeVideoScout(input = {}, base = defaultVideoScout) {
  const weights = input.weights || {};
  return {
    ...defaultVideoScout,
    ...base,
    ...input,
    enabled: input.enabled === undefined ? Boolean(base.enabled) : Boolean(input.enabled),
    intervalMinutes: clamp(input.intervalMinutes ?? base.intervalMinutes, 15, 1440, defaultVideoScout.intervalMinutes),
  // Mantém uma rotação ampla de páginas para que novas garimpagens não
  // fiquem presas aos mesmos primeiros resultados da API.
  scanPage: clamp(input.scanPage ?? base.scanPage, 1, 50, defaultVideoScout.scanPage),
    maxSales: clamp(input.maxSales ?? base.maxSales, 0, 1_000_000, defaultVideoScout.maxSales),
    minCommissionPercent: clamp(input.minCommissionPercent ?? base.minCommissionPercent, 0, 100, defaultVideoScout.minCommissionPercent),
    maxCreatorVideos: clamp(input.maxCreatorVideos ?? base.maxCreatorVideos, 0, 1_000_000, defaultVideoScout.maxCreatorVideos),
    minShopeeVideoScore: clamp(input.minShopeeVideoScore ?? base.minShopeeVideoScore, 0, 100, defaultVideoScout.minShopeeVideoScore),
    minInstagramViralScore: clamp(input.minInstagramViralScore ?? base.minInstagramViralScore, 0, 100, defaultVideoScout.minInstagramViralScore),
    preferredPriceMax: clamp(input.preferredPriceMax ?? base.preferredPriceMax, 1, 10_000, defaultVideoScout.preferredPriceMax),
    searchLimit: clamp(input.searchLimit ?? base.searchLimit, 10, 100, defaultVideoScout.searchLimit),
    pagesPerTerm: clamp(input.pagesPerTerm ?? base.pagesPerTerm, 1, 3, defaultVideoScout.pagesPerTerm),
    maxConcurrentSearches: clamp(input.maxConcurrentSearches ?? base.maxConcurrentSearches, 1, 5, defaultVideoScout.maxConcurrentSearches),
    winnerProductName: String(input.winnerProductName ?? base.winnerProductName ?? '').trim().slice(0, 160),
    winnerProductId: String(input.winnerProductId ?? base.winnerProductId ?? '').trim().slice(0, 80),
    winnerProductUrl: String(input.winnerProductUrl ?? base.winnerProductUrl ?? '').trim().slice(0, 500),
    winnerProductCategory: String(input.winnerProductCategory ?? base.winnerProductCategory ?? '').trim().slice(0, 160),
    weights: {
      shopee: { ...defaultVideoScout.weights.shopee, ...base.weights?.shopee, ...weights.shopee },
      instagram: { ...defaultVideoScout.weights.instagram, ...base.weights?.instagram, ...weights.instagram }
    }
  };
}
