# Fotos da Organização

Plataforma web de gestão e visualização de fotografias e vídeos **sobre o Microsoft 365**.
O OneDrive/SharePoint continua a ser o armazenamento oficial dos originais. A aplicação mantém
apenas metadados, índices, álbuns, favoritos, partilhas e uma pequena cache de miniaturas.

```text
React (frontend/) ──► Laravel API (backend/) ──► MySQL · Redis ──► Microsoft Graph ──► OneDrive / SharePoint
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, fluxos de dados, decisões e riscos |
| [docs/MICROSOFT_GRAPH.md](docs/MICROSOFT_GRAPH.md) | Registo no Entra ID, permissões, Sites.Selected, configuração OneDrive/SharePoint |
| [docs/DATABASE.md](docs/DATABASE.md) | Esquema da base de dados e índices |
| [docs/API.md](docs/API.md) | Contrato da API REST |
| [docs/SECURITY.md](docs/SECURITY.md) | Modelo de segurança e privacidade |
| [docs/AI.md](docs/AI.md) | IA (NVIDIA): descrições, etiquetas, OCR, pesquisa por significado |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Produção: Ubuntu, Nginx, PHP-FPM, MySQL, Redis, Supervisor, SSL |
| [frontend/README.md](frontend/README.md) | Detalhes do frontend |

## Requisitos (desenvolvimento, sem Docker)

- PHP 8.3+ com as extensões `pdo_mysql`, `gd`, `exif`, `intl`, `sodium` (o MAMP inclui todas)
- Composer 2
- MySQL 8 (ex.: MAMP, porta 8889)
- Redis (ex.: `brew install redis && brew services start redis`)
- Node.js 24 + npm

## Instalação rápida

```bash
# 1. Backend
cd backend
composer install
cp .env.example .env
php artisan key:generate
# Edite .env: DB_*, REDIS_*, e (quando tiver o registo no Entra ID) MICROSOFT_*
mysql -h127.0.0.1 -P8889 -uroot -proot -e "CREATE DATABASE photos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
php artisan migrate

# 2. Frontend
cd ../frontend
npm install
```

## Executar em desenvolvimento

Quatro terminais:

```bash
cd backend && php artisan serve --port=8000                          # API
cd backend && php artisan queue:work --queue=sync,media,default     # workers
cd backend && php artisan schedule:work                              # sincronização periódica
cd frontend && npm run dev                                           # SPA em http://localhost:5173
```

Abra <http://localhost:5173>. O Vite faz proxy de `/api`, `/auth` e `/sanctum` para o Laravel, por isso
tudo corre na mesma origem e os cookies de sessão funcionam sem CORS.

### Experimentar sem Microsoft 365 (modo de demonstração)

```bash
# no backend/.env: APP_ENV=local e AUTH_DEV_LOGIN=true
cd backend
php artisan photos:demo --count=5000
```

Na página de entrada aparece um formulário "login de desenvolvimento". O primeiro utilizador criado
fica super administrador. As imagens de demonstração são geradas localmente. Os vídeos de demonstração
têm miniatura e duração, mas não são reproduzíveis.

### Ligar ao Microsoft 365

1. Registe a aplicação no Entra ID e conceda as permissões ([docs/MICROSOFT_GRAPH.md](docs/MICROSOFT_GRAPH.md)).
2. Preencha `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` e `MICROSOFT_REDIRECT_URI`.
3. Defina `MICROSOFT_BOOTSTRAP_SUPER_ADMINS=o.seu.email@organizacao.org` e entre com a Microsoft.
4. Em **Administração → Bibliotecas**, escolha site → biblioteca de documentos → pasta, valide e sincronize.

## Testes

```bash
cd backend && php artisan test          # 81 testes: auth, Graph (mocks), sync, permissões, partilhas...
cd frontend && npm run test -- --run    # 47 testes de componentes e utilitários
cd frontend && npm run typecheck && npm run lint && npm run build
```

## Comandos úteis

| Comando | Descrição |
|---|---|
| `php artisan photos:sync [--library=ID] [--full]` | Agenda sincronização (executada pelos workers) |
| `php artisan photos:demo --count=N [--fresh]` | Biblioteca de demonstração |
| `php artisan photos:make-admin email [--role=super_admin]` | Promove um utilizador |
| `php artisan photos:prune-thumbnails` | Limpa miniaturas antigas da cache |

## Estrutura

```text
backend/    Laravel 13 (API, sincronização, integração Microsoft Graph)
frontend/   React 19 + TypeScript + Vite (SPA)
docs/       Documentação técnica
deploy/     Exemplos de configuração Nginx e Supervisor para produção
```
