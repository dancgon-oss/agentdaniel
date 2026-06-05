#!/bin/bash
# Deploy GereSala → Contabo VPS (Nginx)
# Uso: ./deploy.sh usuario@ip-da-contabo
# Exemplo: ./deploy.sh root@123.456.789.10

set -e

SERVER="${1:?Informe o servidor: ./deploy.sh root@SEU_IP}"
REMOTE_DIR="/var/www/geresala"
NGINX_CONF="/etc/nginx/sites-available/geresala"

echo "▶ Fazendo build..."
npm run build

echo "▶ Enviando dist/ para $SERVER:$REMOTE_DIR ..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR"
rsync -avz --delete dist/ "$SERVER:$REMOTE_DIR/"

echo "▶ Configurando Nginx..."
ssh "$SERVER" bash <<EOF
# Instala Nginx se não tiver
if ! command -v nginx &> /dev/null; then
  apt-get update -q && apt-get install -y nginx
fi

# Escreve config do site
cat > $NGINX_CONF << 'NGINXCONF'
server {
    listen 80;
    server_name _;

    root /var/www/geresala;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache para assets com hash no nome
    location ~* \.(js|css|png|svg|ico|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
NGINXCONF

# Ativa o site
ln -sf $NGINX_CONF /etc/nginx/sites-enabled/geresala
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "✅ Nginx recarregado."
EOF

echo ""
echo "✅ Deploy concluído!"
echo "   Acesse: http://$(echo $SERVER | cut -d@ -f2)"
