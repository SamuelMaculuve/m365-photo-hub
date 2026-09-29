# Instalação em produção (Ubuntu 24.04)

Topologia recomendada: **um único domínio** (`https://fotos.organizacao.org`). O Nginx serve o SPA
(`frontend/dist`) e encaminha `/api`, `/auth` e `/sanctum` para o Laravel (PHP-FPM). Os workers correm
sob Supervisor e o scheduler corre via cron.

## 1. Pacotes

```bash
sudo apt update
sudo apt install -y nginx mysql-server redis-server supervisor unzip git \
  php8.3-fpm php8.3-cli php8.3-mysql php8.3-redis php8.3-gd php8.3-intl php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-exif
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs   # só para compilar o frontend
sudo apt install -y certbot python3-certbot-nginx
```

## 2. MySQL e Redis

```sql
CREATE DATABASE photos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'photos'@'localhost' IDENTIFIED BY '<palavra-passe-forte>';
GRANT ALL PRIVILEGES ON photos.* TO 'photos'@'localhost';
```

Redis: em `/etc/redis/redis.conf` defina `bind 127.0.0.1`, `requirepass <palavra-passe>` e
`maxmemory-policy noeviction` (as filas não podem ser despejadas). Depois: `sudo systemctl restart redis`.

## 3. Código

```bash
sudo mkdir -p /var/www/fotos && sudo chown $USER:www-data /var/www/fotos
git clone <repositório> /var/www/fotos
cd /var/www/fotos/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && php artisan key:generate
```

`.env` de produção (valores essenciais):

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://fotos.organizacao.org
FRONTEND_URL=/
AUTH_DEV_LOGIN=false
SANCTUM_STATEFUL_DOMAINS=fotos.organizacao.org
SESSION_DOMAIN=fotos.organizacao.org
SESSION_SECURE_COOKIE=true
SESSION_DRIVER=redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_CLIENT=phpredis
REDIS_PASSWORD=<palavra-passe>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=photos
DB_USERNAME=photos
DB_PASSWORD=<palavra-passe-forte>
MICROSOFT_TENANT_ID=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=https://fotos.organizacao.org/auth/microsoft/callback
MICROSOFT_BOOTSTRAP_SUPER_ADMINS=ti@organizacao.org
LOG_STACK=daily
```

> `TRUSTED_PROXIES` só é necessário atrás de um balanceador. Com `config:cache`, defina-o como variável
> de ambiente do sistema (PHP-FPM `env[TRUSTED_PROXIES]`), porque é lido em `bootstrap/app.php`.

```bash
php artisan migrate --force
php artisan storage:link || true
php artisan config:cache && php artisan route:cache && php artisan event:cache
sudo chown -R www-data:www-data storage bootstrap/cache
chmod 600 .env && sudo chown www-data:www-data .env
```

Frontend:

```bash
cd /var/www/fotos/frontend
npm ci && npm run build          # gera dist/
```

## 4. Nginx e SSL

```bash
sudo cp /var/www/fotos/deploy/nginx.conf /etc/nginx/sites-available/fotos
sudo sed -i 's/fotos.organizacao.org/<o-seu-dominio>/g' /etc/nginx/sites-available/fotos
sudo ln -s /etc/nginx/sites-available/fotos /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d <o-seu-dominio>
sudo nginx -t && sudo systemctl reload nginx
```

PHP-FPM (`/etc/php/8.3/fpm/pool.d/www.conf`): ajuste `pm.max_children` à memória disponível
(cerca de 60 MB por processo). A grelha pede muitas miniaturas em paralelo; as que estão em cache
são servidas rapidamente pelo disco.

## 5. Workers (Supervisor)

```bash
sudo cp /var/www/fotos/deploy/supervisor/fotos-workers.conf /etc/supervisor/conf.d/
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl status
```

| Worker | Fila | Função |
|---|---|---|
| `fotos-sync-worker` (2) | `sync` | Delta queries; jobs longos (timeout de 1 h, retomam do checkpoint) |
| `fotos-media-worker` (2) | `media` | EXIF, verificação de itens, IA (se activa) |
| `fotos-notification-worker` (1) | `default` | Notificações e tarefas leves |

Os jobs de sincronização usam `WithoutOverlapping` por drive, por isso aumentar os workers `sync`
paraleliza drives diferentes sem conflitos.

## 6. Scheduler

```bash
sudo cp /var/www/fotos/deploy/fotos-scheduler.cron /etc/cron.d/fotos-scheduler
```

| Tarefa | Frequência |
|---|---|
| `photos:dispatch-due-syncs` | 5 min (cada drive é sincronizado a cada `SYNC_INTERVAL_MINUTES`) |
| `model:prune` (sync_logs, audit_logs) | Diária, 02:30 |
| `photos:prune-thumbnails` | Diária, 03:00 |
| `queue:prune-failed` | Diária |

## 7. Actualizações

```bash
cd /var/www/fotos && git pull
cd backend && composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan event:cache
php artisan queue:restart            # os workers recarregam o código
cd ../frontend && npm ci && npm run build
```

## 8. Monitorização

| Onde | O quê |
|---|---|
| **Administração → Painel** | Totais, última sincronização, erros nas últimas 24 h, estado (Óptimo / Degradado / Erro) |
| **Administração → Sincronização / Erros** | Jobs, progresso, logs por job |
| `storage/logs/graph-*.log` | Erros e throttling do Microsoft Graph (sem tokens) |
| `storage/logs/sync-*.log` | Falhas de sincronização |
| `storage/logs/performance-*.log` | Pedidos acima de `SLOW_REQUEST_MS` |
| `storage/logs/laravel-*.log` | Excepções |
| `php artisan queue:failed` | Jobs falhados |
| `GET /up` e `GET /api/health` | Health checks para monitorização externa |

## 9. Cópias de segurança

- **MySQL** (diariamente): álbuns, favoritos, partilhas, auditoria e configuração só existem aqui.
  `mysqldump --single-transaction photos | gzip > photos-$(date +%F).sql.gz`
- **`.env`** (em local seguro).
- **Não é preciso** salvaguardar `storage/app/thumbnails`: é uma cache reconstruível.
- Os originais continuam protegidos pelas políticas de retenção e backup do Microsoft 365.

## 10. Frontend separado (opcional)

É possível servir o SPA noutro host (ex.: CDN). Nesse caso é preciso configurar CORS com credenciais
(`config/cors.php`), `SANCTUM_STATEFUL_DOMAINS` com o domínio do SPA, `SESSION_DOMAIN=.organizacao.org`
(domínio pai comum) e `SameSite=None; Secure`. A mesma origem continua a ser a configuração recomendada.
