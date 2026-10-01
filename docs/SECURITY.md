# Segurança e privacidade

## Princípios

1. **O Microsoft 365 é a fonte de verdade.** Os originais nunca são copiados para o servidor. A aplicação guarda
   apenas metadados e miniaturas pequenas em cache, invalidadas pelo eTag.
2. **Nenhum token Microsoft chega ao browser.** Não existe código Graph no frontend.
3. **A autorização é sempre verificada no backend**, antes de qualquer cache ou pedido ao Graph.
4. **Menor privilégio**: `Sites.Selected` para a identidade da aplicação; escrita só quando activada.

## Autenticação

- Microsoft Entra ID, *multi-tenant* com lista branca, **Authorization Code Flow + PKCE (S256)** com `state` e `nonce`,
  executado no servidor (confidential client).
- O `id_token` é validado: assinatura (JWKS, com renovação se as chaves rodarem), `aud`, `nonce`, expiração,
  `iss` igual a `{authority}/{tid}/v2.0` e `tid` de uma organização **registada e activa** (tabela `organizations`).
  Contas de qualquer outro tenant são recusadas (`invalid_tenant`).
- As contas são identificadas por `(tid, oid)` (imutável), nunca pelo email. Ligar uma conta a um perfil exige
  sessão iniciada nesse perfil e um novo login Microsoft com essa conta; não há ligação automática por email.
- **Acervo comum entre organizações** (decisão explícita): as bibliotecas "Todas as organizações" são visíveis
  a qualquer utilizador de qualquer organização registada. O alcance da aplicação em cada tenant continua
  limitado pelo `Sites.Selected` (só os sites concedidos pelo administrador desse tenant).
- **App Roles**: só contam as de organizações com `trust_app_roles` (por omissão, apenas o tenant "casa"),
  para que o administrador de um tenant parceiro não se possa atribuir `super_admin` no seu próprio Entra ID.
- Os tokens delegados ficam **cifrados em repouso** (cast `encrypted` com `APP_KEY`) e ocultos na serialização.
- A renovação usa um lock Redis por utilizador. Com `invalid_grant`, o token é apagado e a sessão termina,
  obrigando a novo login.
- A sessão do SPA usa um cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção e sessão cifrada
  (Laravel Sanctum em modo SPA). **CSRF** é obrigatório em todos os pedidos de escrita (419 sem token).
- A sessão é regenerada no login e invalidada no logout.
- O login de desenvolvimento (`AUTH_DEV_LOGIN`) **só existe com `APP_ENV=local`**; noutros ambientes devolve 404.

## Autorização

| Nível | Mecanismo |
|---|---|
| Papel global | App Roles do Entra ID (`roles` claim) ou papel fixado localmente |
| Biblioteca | `library_access`: grupos/utilizadores Entra → papel; `visibility=organisation` = todos (viewer) |
| Media | `MediaPolicy` → `MediaAccessService` (biblioteca activa e acessível, item activo, lixo só para editor+) |
| Álbuns | `AlbumPolicy`. Um álbum da organização **não concede** acesso a fotos de bibliotecas restritas: as contagens e as capas são calculadas sobre o que o utilizador pode ver |
| Admin | `role:photo_admin` (painel, sincronização) e `role:super_admin` (bibliotecas, Graph, utilizadores, auditoria, definições) |
| Conteúdo em drives delegados | Pedido ao Graph com o token do **próprio utilizador**, para que o SharePoint aplique as suas permissões |
| Eliminação na origem | `photo_admin` **e** biblioteca com `allow_writes` **e** confirmação `DELETE`, executada com o token do utilizador. Vai para a Reciclagem, nunca `permanentDelete` |

As caches de permissões (5 min) incluem na chave o papel, os grupos e uma versão global que é
incrementada sempre que bibliotecas, acessos ou utilizadores mudam.

## Partilha

- Os links são **da aplicação**. Não se criam links anónimos do OneDrive.
- O token tem 40 caracteres aleatórios, é mostrado uma única vez, e na base de dados só fica o **SHA-256**.
- Audiências: organização (exige login), pessoas específicas, público.
- Links públicos exigem, em conjunto: a definição global `public_links_enabled` (desligada por omissão),
  a biblioteca com `allow_public_links`, uma identidade de aplicação e **expiração obrigatória**
  (máximo configurável).
- Palavra-passe opcional (bcrypt), com rate limit por IP e por link.
- As imagens da partilha usam **URLs assinados e temporários** (2 h). A revogação e a expiração são
  verificadas em cada pedido, mesmo com uma assinatura válida.
- Uma partilha só expõe itens a que **o criador continua a ter acesso**.
- Links públicos não incluem GPS e enviam `X-Robots-Tag: noindex`.

## Privacidade

- **GPS**: a definição `gps_precision` pode ser `exact`, `city` (só a localidade) ou `hidden`. O GPS só é
  visível a quem pode ver a fotografia.
- **Geocodificação offline**: o nome da localidade é calculado com a base GeoNames importada (licença CC BY 4.0, atribuição: "Dados de localidades © GeoNames"); nenhuma coordenada é enviada para esse cálculo.
- **Mapas**: os mapas usam imagens do OpenStreetMap. O browser do utilizador pede ao OpenStreetMap as imagens da zona mostrada, o que revela ao OpenStreetMap a área visualizada, mas nunca a fotografia. Com `gps_precision = city` ou `hidden` não há coordenadas, e portanto não há mapa.
- **IA e reconhecimento facial**: desligados por omissão. A análise facial exige activação explícita de
  `faces_enabled` pelo super administrador, e o fornecedor de IA recebe miniaturas, nunca originais.
  Os resultados ficam separados (`media_analysis`, `media_tags.source = ai`).
- **Auditoria**: regista acções (login, visualização de detalhe, download, lixo, partilhas, administração).
  Remove automaticamente chaves sensíveis (`password`, `token`, `secret`, `code`). O IP pode ser anonimizado
  com `AUDIT_ANONYMISE_IP=true`. A retenção é configurável.

## Protecções HTTP

- Cabeçalhos: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, HSTS em HTTPS. As respostas da API têm CSP `default-src 'none'`.
  O Nginx aplica a CSP do SPA (ver `deploy/nginx.conf`).
- Redireccionamentos para URLs temporários da Microsoft usam `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- Rate limiting: API (300/min por utilizador), miniaturas (3000/min), partilhas públicas (60/min por IP,
  15/min por link+IP), autenticação (30/min por IP), criação de partilhas e uploads.
- `GraphClient` recusa seguir `nextLink`/`deltaLink` para hosts que não sejam `graph.microsoft.com` (SSRF).
- Os erros são centralizados (`ApiErrorRenderer`): mensagens amigáveis traduzidas; os detalhes do Graph e do
  SQL só vão para os logs, e nunca com tokens nem query strings.
- Validação com Form Requests e regras explícitas, e escape de `LIKE` na pesquisa.

## Segredos

- Apenas em variáveis de ambiente (`.env` fora do repositório, permissões `600`, dono `www-data`).
- Nada de segredos em `VITE_*`.
- Rodar `MICROSOFT_CLIENT_SECRET` antes de expirar. Rodar `APP_KEY` implica voltar a cifrar os tokens,
  ou simplesmente apagar `oauth_tokens` (os utilizadores entram de novo).

## Checklist de produção

- [ ] `APP_ENV=production`, `APP_DEBUG=false`, `AUTH_DEV_LOGIN=false`
- [ ] HTTPS com HSTS; `SESSION_SECURE_COOKIE=true`
- [ ] `SANCTUM_STATEFUL_DOMAINS` e `APP_URL` com o domínio real
- [ ] `TRUSTED_PROXIES` correcto se houver balanceador
- [ ] `Sites.Selected` concedido apenas aos sites necessários
- [ ] Redis com palavra-passe e sem exposição externa; MySQL com utilizador dedicado
- [ ] `php artisan config:cache route:cache`
- [ ] Rotação de segredos documentada
