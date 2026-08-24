# OfertaFluxo — painel de ofertas Shopee

Este projeto possui um painel web local para consultar ofertas na **Open API de Afiliados da Shopee**, filtrar preço/desconto, evitar repetição e enviar cada oferta a números que autorizaram o recebimento via **WhatsApp Cloud API**.

## Abrir o painel

```powershell
npm start
```

Depois, abra [http://localhost:3000](http://localhost:3000). O painel permite configurar a Shopee, visualizar as ofertas, cadastrar destinos, ligar a automação e acompanhar atividades. As configurações feitas pela tela são gravadas somente em `data/settings.json`, que não é versionado.

## Usuários e acesso

Na primeira abertura, crie a conta do administrador na tela de cadastro. A plataforma aceita até **três usuários**; cada um recebe configurações, grupos, histórico de ofertas, auditoria de envios e sessão do WhatsApp próprios. O primeiro cadastro preserva a configuração local já existente.

Em **Minha conta**, cada usuário pode ativar 2FA por TOTP com Google Authenticator, Microsoft Authenticator ou equivalente. As sessões usam cookie `HttpOnly` e expiram após 8 horas.

## Limite importante sobre grupos

O painel usa conexão direta por QR Code para publicar em grupos, um método não oficial e sujeito às regras do WhatsApp. Use apenas em grupos administrados por você, com participantes que aceitaram receber promoções. Para uma operação comercial de maior escala, prefira a WhatsApp Cloud API com opt-in e templates aprovados.

## Evolution API e grupos

O painel também aceita a Evolution API. Após ela estar instalada e a instância ser conectada ao WhatsApp por QR Code, vá em **Integrações → Evolution API**, informe a URL, a chave e o nome da instância; então habilite-a. Em **Destinos**, selecione `Grupo da Evolution API` e informe o ID do grupo (terminado em `@g.us`).

## Hospedagem sem computador ligado

O painel pode ir para Vercel ou Cloudflare, mas a conexão direta do WhatsApp por QR Code não deve rodar nesses serviços serverless: ela precisa manter uma sessão WebSocket e os arquivos de autenticação ativos. Para o envio automático a grupos sem depender deste computador, hospede o projeto inteiro em uma VPS com processo persistente (por exemplo, uma VPS Linux com Node.js e PM2, ou Docker funcionando). A automação do painel dispara **uma** oferta inédita por vez para cada destino ativo no intervalo configurado (de 15 minutos a 24 horas).

## Configuração

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env` e complete os valores. Nunca compartilhe esse arquivo. O `.env` atual já contém a credencial Shopee informada durante a configuração local.
3. No [Open API Explorer da Shopee Brasil](https://open-api.affiliate.shopee.com.br/explorer), teste a consulta de ofertas com seu `App ID` e `Secret`. Copie a query e os campos que funcionarem para `config/shopee-offers.graphql`. A estrutura da API pode variar por conta, por isso este passo é intencional. O bot já gera a autenticação SHA256 para o mesmo JSON que envia à API.
4. No Meta for Developers, crie/configure seu app do WhatsApp, obtenha `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, e cadastre os números que consentiram em `WHATSAPP_RECIPIENTS`.
5. Teste uma execução:

```powershell
npm test
npm run run-once
```

## Agendamento

Execute `npm start` para expor `GET /health` e `POST /run`. Seu agendador (Task Scheduler, cron ou serviço em nuvem) deve chamar o endpoint com:

```text
Authorization: Bearer <RUN_SECRET>
```

Defina uma frequência moderada, por exemplo a cada 30–60 minutos. O arquivo local `data/sent-offers.json` guarda os itens já divulgados.

## Regras de envio

- Mensagens de texto livres só são permitidas na janela de atendimento aplicável do WhatsApp. Para disparos iniciados pelo negócio, use `WHATSAPP_MODE=template` e aprove um template no WhatsApp Manager.
- Envie somente para pessoas que deram opt-in e forneça uma forma simples de parar de receber.
- Divulgue apenas links gerados pela plataforma de Afiliados da Shopee, conforme as regras do programa.

## Proteções ativas

- O painel atende somente `127.0.0.1` por padrão. Em hospedagem externa, ele exige `PANEL_ACCESS_KEY` forte e `PANEL_ALLOWED_ORIGINS`; use HTTPS por meio de um proxy confiável.
- Novos destinos exigem confirmação de autorização para receber ofertas.
- Os envios passam por uma fila com espaçamento fixo, limite por hora, limite diário, intervalo mínimo por destino e período de descanso noturno. Ajuste esses valores em **Automação → Proteção de envios**.
- `data/whatsapp-session/`, credenciais, histórico e auditoria de entregas são ignorados pelo Git. Proteja o computador, use senha forte e criptografia de disco.
- Para o endpoint de agendador externo, use um `RUN_SECRET` exclusivo com pelo menos 24 caracteres e nunca o exponha em links ou capturas de tela.
