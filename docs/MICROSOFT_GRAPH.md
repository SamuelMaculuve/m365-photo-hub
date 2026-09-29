# Microsoft Entra ID e Microsoft Graph

Este guia descreve como registar a aplicação, que permissões conceder e porquê, e como ligar
bibliotecas OneDrive/SharePoint.

## 1. Registo da aplicação (portal Entra ID)

1. **Entra ID → App registrations → New registration**
   - Nome: `Fotos da Organização`
   - *Supported account types*: **Accounts in this organizational directory only** (single-tenant)
   - *Redirect URI* (plataforma **Web**, não SPA):
     - Produção: `https://fotos.organizacao.org/auth/microsoft/callback`
     - Desenvolvimento: `http://localhost:5173/auth/microsoft/callback` (passa pelo proxy do Vite)
2. Anote o **Application (client) ID** → `MICROSOFT_CLIENT_ID` e o **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`.
3. **Certificates & secrets → New client secret** → `MICROSOFT_CLIENT_SECRET`.
   - Guarde-o apenas no `.env` do servidor (permissões 600) ou num cofre de segredos.
   - Registe a data de expiração e planeie a rotação. Um certificado é preferível em produção
     (ver "Melhorias futuras").
4. **Authentication**: deixe *Implicit grant* **desligado**. O fluxo usado é Authorization Code + PKCE,
   executado no servidor.
5. **Token configuration → Add groups claim** → *Security groups*, emitido como **Group ID** no ID token.
   Com demasiados grupos (mais de 200), o Entra envia um *overage* e a aplicação pede os grupos ao Graph.

### App Roles (papéis globais)

Em **App roles → Create app role** (tipo *Users/Groups*), crie:

| Display name | Value | Papel na aplicação |
|---|---|---|
| Super Administrador | `Photos.SuperAdmin` | `super_admin` |
| Administrador de Fotografias | `Photos.Admin` | `photo_admin` |
| Editor | `Photos.Editor` | `editor` |
| Contribuidor | `Photos.Contributor` | `contributor` |
| Visualizador | `Photos.Viewer` | `viewer` |

Atribua-os em **Enterprise applications → Fotos da Organização → Users and groups**, de preferência a grupos.
Os utilizadores sem papel entram como `viewer`. Um super administrador pode fixar localmente o papel
de um utilizador (`role_source = local`), e a partir daí esse papel deixa de seguir o Entra.

`MICROSOFT_BOOTSTRAP_SUPER_ADMINS` dá `super_admin` no primeiro login aos emails indicados, para arrancar a instalação.

## 2. Permissões

### 2.1 Delegadas (em nome do utilizador)

| Permissão | Porquê | Consentimento admin |
|---|---|---|
| `openid`, `profile`, `email` | Login OIDC | Não |
| `offline_access` | Refresh token: o backend renova o acesso sem novo login | Não |
| `User.Read` | Perfil do utilizador | Não |
| `Files.Read.All` | Ler ficheiros a que **o próprio utilizador** tem acesso (miniaturas/conteúdo em bibliotecas delegadas, pesquisa de sites) | Sim |
| `Files.ReadWrite.All` *(só com `MICROSOFT_ENABLE_WRITES=true`)* | Upload e envio para a Reciclagem, sempre verificados pelo SharePoint com as permissões do utilizador | Sim |
| `Files.Read` *(só com `MICROSOFT_PERSONAL_ONEDRIVE=true`)* | OneDrive pessoal do utilizador | Não |

Com permissões delegadas, o acesso efectivo é **a intersecção** entre a permissão e o que o utilizador pode ver
no SharePoint. Assim, uma permissão delegada nunca dá a um utilizador mais do que ele já tem.

### 2.2 De aplicação (sem utilizador: sincronização e links públicos)

| Permissão | Recomendação |
|---|---|
| **`Sites.Selected`** | ✅ **Recomendada.** A aplicação só acede aos sites que um administrador conceder explicitamente. |
| `Files.Read.All` / `Sites.Read.All` (aplicação) | ❌ Evitar. Dá leitura de **todo** o OneDrive e SharePoint do tenant. Uma fuga do segredo exporia tudo. |

A sincronização usa a identidade da aplicação, e não o token de um administrador, porque:
- continua a funcionar se o administrador sair da organização ou mudar de palavra-passe;
- links públicos precisam de obter ficheiros sem um utilizador presente.

### 2.3 Conceder acesso a um site (Sites.Selected)

Depois de dar consentimento de administrador a `Sites.Selected` (aplicação), conceda o acesso a cada site.
Um administrador com `Sites.FullControl.All` pode fazê-lo pelo Graph Explorer ou pelo PowerShell:

```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [
    { "application": { "id": "<MICROSOFT_CLIENT_ID>", "displayName": "Fotos da Organização" } }
  ]
}
```

Use `"roles": ["write"]` apenas se a biblioteca permitir uploads ou eliminação (`allow_writes`).

Para obter o `site-id`:
`GET https://graph.microsoft.com/v1.0/sites/organizacao.sharepoint.com:/sites/Fotos`

Com PnP PowerShell:

```powershell
Grant-PnPAzureADAppSitePermission -AppId <CLIENT_ID> -DisplayName "Fotos da Organização" -Site https://organizacao.sharepoint.com/sites/Fotos -Permissions Read
```

## 3. Configurar uma biblioteca na aplicação

**Administração → Bibliotecas → Nova biblioteca**

1. **Site**: pesquise pelo nome ou **cole o URL completo** do site. A pesquisa por nome usa o token
   delegado do administrador. O URL funciona sempre com `Sites.Selected`.
2. **Biblioteca de documentos**: por exemplo *Documentos* ou *Fotografias*.
3. **Pasta(s)-raiz**: uma ou mais pastas, ou a raiz. A aplicação **não assume nenhuma estrutura**:
   `Fotos/`, `Pictures/`, `Media/`, `Shared Documents/Photos/` são todas válidas.
4. **Opções**: visibilidade (`organisation` = todos os utilizadores; `restricted` = só quem constar do
   separador *Acessos*), links públicos, escrita.
5. **Validar**: a aplicação confirma o token, o acesso ao drive e à pasta e a disponibilidade de delta.
6. **Sincronizar**: a primeira sincronização é feita em segundo plano, com progresso visível.

### Acessos

Em bibliotecas `restricted`, adicione **grupos do Entra ID** (object ID do grupo) ou utilizadores (object ID)
com um papel: `viewer`, `contributor`, `editor` ou `photo_admin`. O papel efectivo é o maior entre o papel
global e o da biblioteca.

### OneDrive pessoal

Suportado em modo **delegado** (`auth_mode = delegated`): a sincronização usa o token do dono do OneDrive.
Active `MICROSOFT_PERSONAL_ONEDRIVE=true`. Links públicos ficam indisponíveis nestas bibliotecas.

## 4. Como a aplicação usa o Graph

| Funcionalidade | Pedido Graph |
|---|---|
| Sincronização inicial e incremental | `GET /drives/{id}/root/delta` (+ `@odata.nextLink` / `@odata.deltaLink`) |
| Validação | `GET /drives/{id}`, `GET /drives/{id}/items/{item}`, `GET /drives/{id}/root/delta?token=latest` |
| Navegador de pastas | `GET /drives/{id}/items/{item}/children` |
| Sites | `GET /sites?search=`, `GET /sites/{host}:/{path}`, `GET /sites/{id}/drives` |
| Miniaturas | `GET /drives/{id}/items/{item}/thumbnails/0/{small\|c320x320\|large\|c2048x2048}/content` |
| Vídeo e original | `GET /drives/{id}/items/{item}/content` sem seguir o 302: o browser é redireccionado para o URL temporário |
| EXIF | `GET .../content` com `Range: bytes=0-131071` (só o cabeçalho) |
| Reciclagem | `DELETE /drives/{id}/items/{item}` (nunca `permanentDelete`) |
| Upload | `POST .../createUploadSession`; o browser envia os blocos directamente para a Microsoft |
| Grupos (overage) | `GET /me/transitiveMemberOf/microsoft.graph.group` |

### Limitações conhecidas

- **Delta só na raiz** em OneDrive for Business/SharePoint. A aplicação mantém um cursor por drive e filtra
  localmente as pastas configuradas (tabela `drive_folders`).
- **Mover pastas**: o delta devolve a pasta, não necessariamente os descendentes. A aplicação recalcula
  caminho, biblioteca e âmbito de toda a sub-árvore.
- **Token delta expirado** (`410 resyncRequired`): o mesmo job passa a sincronização completa com
  marca-e-varre. Álbuns e favoritos são preservados, porque a identidade de cada ficheiro é `(drive_id, item_id)`.
- **Metadados**: o facet `photo` nem sempre vem preenchido no SharePoint. Para JPEG sem data, a aplicação
  lê o EXIF do cabeçalho. HEIC/vídeo usam os metadados do Graph ou a data de criação.
- **Restauro da Reciclagem via Graph** não está disponível para OneDrive for Business. O restauro faz-se na
  Reciclagem do SharePoint, e a sincronização seguinte reactiva o item.
- **Vídeo**: não há transcodificação. Formatos que o browser não suporta (ex.: HEVC em alguns browsers)
  podem ser descarregados ou abertos no Microsoft 365 ("Abrir no Microsoft 365").

### Throttling

`GraphClient` respeita `Retry-After` em 429/503/504, usa backoff exponencial com jitter nos restantes erros
temporários, renova o token uma vez após 401 e identifica o tráfego com
`User-Agent: NONISV|Organisation|OrganisationPhotos/1.0` (recomendação da Microsoft).
Os pedidos web usam poucas tentativas para não bloquear o utilizador; os jobs de sincronização usam mais.

## 5. Melhorias futuras

- Autenticação da aplicação por **certificado** (client assertion) em vez de segredo.
- Subscrições de **webhooks** (`/subscriptions`) para sincronizar quase em tempo real. A delta query já
  está preparada; o webhook apenas dispararia `SyncManager::start`.
