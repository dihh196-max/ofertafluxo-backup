// Ponto único de extensão para uma futura integração oficial da Shopee.
// A Open API usada pelo projeto não expõe creator_video_count. Não há scraping,
// navegação automatizada no app ou estimativa: UNKNOWN é um dado explícito.
export async function creatorVideoCountForProduct() {
  return { value: null, status: 'UNKNOWN', source: 'official-source-not-configured' };
}
