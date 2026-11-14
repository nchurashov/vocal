#!/usr/bin/env bash
# Установка сервера «Вокал под бокал» на Ubuntu (запускать от root): sudo bash server/install.sh
# Повторный запуск безопасен: обновляет код и перезапускает сервис, настройки (/etc/vocal-api.env) не трогает.
# Ничего существующего не меняет: свой пользователь, своя папка, свой сервис, отдельный файл сайта nginx для поддомена.
set -euo pipefail
DOMAIN="${DOMAIN:-api.xn--80aegcchwyadfe4gvdce.xn--p1ai}"   # api.законныевыходные.рф
APP=/opt/vocal-api; DATA=/var/lib/vocal-api; BACKUP=/var/backups/vocal-api; ENVF=/etc/vocal-api.env
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" = 0 ] || { echo "Запусти от root: sudo bash $0"; exit 1; }

echo "== 1. Node.js 22.13+ (встроенный SQLite)"
need=1
if command -v node >/dev/null; then v=$(node -p 'process.versions.node'); IFS=. read -r a b _ <<<"$v"; if [ "$a" -gt 22 ] || { [ "$a" = 22 ] && [ "$b" -ge 13 ]; }; then need=0; fi; fi
if [ $need = 1 ]; then
  echo "Нужен Node.js 22.13+, сейчас: $(node -v 2>/dev/null || echo нет)."
  echo "Поставь так (официальный репозиторий NodeSource), потом запусти скрипт снова:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
  echo "Внимание: если на сервере уже работает бот на Node другой версии - сначала проверь, что он не сломается."
  exit 1
fi

echo "== 2. Пользователь и папки"
id vocal >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin vocal
mkdir -p "$APP" "$DATA" "$BACKUP"
install -m 0644 "$HERE/server.js" "$APP/server.js"
chown -R vocal:vocal "$DATA" "$BACKUP"; chmod 700 "$DATA" "$BACKUP"

echo "== 3. Настройки ($ENVF)"
if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<EOF
# Токен отдельного бота входа (BotFather). Не публиковать.
BOT_TOKEN=
BOT_NAME=vocal_pod_bokal_bot
HOST=127.0.0.1
PORT=8787
DB_PATH=$DATA/vocal.db
TRUST_PROXY=1
ORIGINS=https://nchurashov.github.io,capacitor://localhost,https://localhost,http://localhost
EOF
  chmod 600 "$ENVF"
  echo "Создан $ENVF - впиши BOT_TOKEN и BOT_NAME, потом: systemctl restart vocal-api"
fi

echo "== 4. Сервис systemd"
cat > /etc/systemd/system/vocal-api.service <<EOF
[Unit]
Description=Vocal pod bokal API
After=network-online.target
Wants=network-online.target
[Service]
User=vocal
Group=vocal
EnvironmentFile=$ENVF
ExecStart=$(command -v node) --no-warnings $APP/server.js
Restart=always
RestartSec=3
# песочница: сервис видит только свою папку с данными
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA
MemoryMax=300M
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now vocal-api
systemctl restart vocal-api
sleep 1; curl -fsS http://127.0.0.1:8787/health && echo "  - сервис отвечает"

echo "== 5. Резервная копия базы каждую ночь (хранить 14 дней)"
command -v sqlite3 >/dev/null || apt-get install -y sqlite3
cat > /etc/cron.d/vocal-api-backup <<EOF
17 3 * * * vocal sqlite3 $DATA/vocal.db ".backup '$BACKUP/vocal-\$(date +\%F).db'" && find $BACKUP -name 'vocal-*.db' -mtime +14 -delete
EOF

echo "== 6. nginx для $DOMAIN"
if command -v nginx >/dev/null; then
  CONF=/etc/nginx/sites-available/vocal-api
  sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/nginx.conf" > "$CONF"
  ln -sf "$CONF" /etc/nginx/sites-enabled/vocal-api
  nginx -t && systemctl reload nginx
  if command -v certbot >/dev/null; then
    echo "Сертификат HTTPS: certbot --nginx -d $DOMAIN (нужна DNS-запись A для поддомена api на IP сервера)"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "certbot не прошёл: проверь DNS-запись и запусти команду вручную"
  else
    echo "Нет certbot: apt-get install -y certbot python3-certbot-nginx, потом certbot --nginx -d $DOMAIN"
  fi
else
  echo "nginx не найден. Если сайт работает через другой сервер (Caddy, Apache) - направь $DOMAIN на 127.0.0.1:8787 с HTTPS (пример в server/README.md)."
fi
echo "Готово. Проверка снаружи: curl https://$DOMAIN/health"
