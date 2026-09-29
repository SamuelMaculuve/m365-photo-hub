# Fotos — Frontend (React)

Interface web da plataforma de gestão de fotografias da organização sobre o Microsoft 365
(OneDrive/SharePoint). O frontend fala **apenas** com a API Laravel (`/api`, `/auth`, `/sanctum`);
nunca comunica com o Microsoft Graph nem recebe tokens da Microsoft.

- Contrato da API: [`../docs/API.md`](../docs/API.md)
- Arquitectura: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)

## Tecnologias

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · primitivas de UI próprias (estilo shadcn, sobre Radix) ·
TanStack Query v5 · React Router v7 · @tanstack/react-virtual · axios · react-i18next (pt/en) · lucide-react ·
Vitest + Testing Library.

## Requisitos

- Node.js 24 e npm
- Backend Laravel a correr em `http://127.0.0.1:8000` (ver `../backend`)

## Instalação

```bash
cd frontend
npm install
cp .env.example .env   # opcional: só define VITE_APP_NAME
```

> Nunca coloque segredos em variáveis `VITE_*`: são incluídas no código enviado para o browser.

## Desenvolvimento

```bash
npm run dev
```

Abre em <http://localhost:5173>. O Vite faz proxy de `/api`, `/auth` e `/sanctum` para
`http://127.0.0.1:8000`, pelo que o SPA e a API partilham a mesma origem e os cookies de sessão
(Laravel Sanctum, modo SPA) funcionam sem configuração de CORS.

No backend, confirme que `SANCTUM_STATEFUL_DOMAINS` inclui `localhost:5173` e que `SESSION_DOMAIN`
está compatível.

Para iniciar sessão sem Microsoft em ambiente local, active no backend `APP_ENV=local` e
`AUTH_DEV_LOGIN=true`; a página de entrada mostra então um pequeno formulário de desenvolvimento.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 5173) |
| `npm run build` | Verificação de tipos + compilação de produção para `dist/` |
| `npm run preview` | Pré-visualização local da compilação |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest em modo interactivo (`npm run test -- --run` para uma única execução) |

## Estrutura

```text
src/
├── components/{photos,albums,viewer,search,layout,ui,admin,share}/
├── pages/{Photos,Albums,Favourites,People,Places,Search,Shared,Trash,Settings,Admin,Login,PublicShare,NotFound}/
├── services/   # api.ts (axios + ApiError), photos, albums, auth, search, shares, admin, places, uploads
├── hooks/      # usePhotos, useTimeline, useAlbums, useSearch, useAuth, useAdmin, …
├── layouts/    # DashboardLayout (guarda de rota), RequireAdmin
├── i18n/       # index.ts + locales/pt.json, locales/en.json
├── lib/        # formatação (Intl), construção de linhas da timeline, pesquisa, política de repetição
├── types/      # tipos que espelham os Resources da API
└── routes.tsx  # createBrowserRouter
```

Regras: os componentes não chamam a API directamente — usam `services/` através de `hooks/`.
Todo o texto da interface passa por chaves de tradução (omissão: português de Moçambique, grafia
anterior ao Acordo Ortográfico; alternativa: inglês).

## Notas de implementação

- **Timeline**: `GET /api/timeline/buckets` (contagens mensais) + `GET /api/photos` por cursor.
  Os itens são achatados em linhas (cabeçalho de mês, cabeçalho de dia, linhas de miniaturas) e
  virtualizados com `useWindowVirtualizer`, pelo que 100 000 itens continuam fluidos.
- **Visualizador**: aberto através de `?photo=<id>` (o botão "voltar" fecha-o); teclado
  (← → Esc F + − R I), swipe, pinça e duplo toque por Pointer Events; carrega `large` e depois `xlarge`.
- **Erros**: todas as respostas de erro são normalizadas em `ApiError` (`status`, `code`, `message`,
  `errors`). 401 → `/login`; sem repetição em 4xx; 503/429 repetidos com backoff (respeita `Retry-After`).
- **Carregamentos** (se `permissions.upload`): sessão criada em `POST /api/libraries/{id}/uploads` e
  ficheiro enviado por blocos, com `fetch`, directamente para o URL pré-autenticado do Microsoft 365.

## Testes

```bash
npm run test -- --run
```

Incluem: normalização de erros da API, construção/agrupamento de linhas da timeline (com teste de
100 000 itens), formatação de datas e helpers de pesquisa, política de repetição, página de entrada,
grelha + abertura do visualizador, navegação por teclado no visualizador, favoritos, criação de
álbum, confirmação "DELETE" no lixo e fluxo de palavra-passe da partilha pública.

## Produção

```bash
npm ci
npm run build
```

O resultado fica em `dist/` (ficheiros estáticos). Deve ser servido pelo **nginx na mesma origem
que a API** (ex.: `https://fotos.org.mz` para o SPA e `https://fotos.org.mz/api` para o Laravel), para
que os cookies de sessão e o CSRF do Sanctum funcionem sem CORS. Exemplo:

```nginx
server {
    server_name fotos.org.mz;
    root /var/www/fotos/frontend/dist;

    # API, autenticação e CSRF → Laravel
    # (aqui via proxy para um vhost interno do backend; em alternativa, fastcgi_pass
    #  para o PHP-FPM com SCRIPT_FILENAME a apontar para backend/public/index.php)
    location ~ ^/(api|auth|sanctum)/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Recursos com hash: cache longa
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA: todas as outras rotas (incluindo /s/<token>) → index.html
    location / {
        try_files $uri /index.html;
    }
}
```

Não armazenar `index.html` em cache de longa duração, para que novas versões sejam carregadas.
