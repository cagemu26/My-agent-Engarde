#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  deploy/install-nginx-ssl.sh <host> <ssh_user> <ssh_password> [cert_zip] [nginx_conf]

Example:
  deploy/install-nginx-ssl.sh 175.27.164.69 ubuntu 'your-password'
EOF
}

if [[ $# -lt 3 ]]; then
    usage
    exit 1
fi

HOST="$1"
SSH_USER="$2"
SSH_PASSWORD="$3"
CERT_ZIP="${4:-/Users/cage/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_ezvw0x5n1xy312_e1c6/temp/drag/linlay.store_nginx.zip}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF="${5:-$SCRIPT_DIR/nginx/engarde-https.conf}"

for cmd in unzip sshpass ssh scp openssl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Missing required command: $cmd" >&2
        exit 1
    fi
done

if [[ ! -f "$CERT_ZIP" ]]; then
    echo "Certificate zip not found: $CERT_ZIP" >&2
    exit 1
fi

if [[ ! -f "$NGINX_CONF" ]]; then
    echo "Nginx config not found: $NGINX_CONF" >&2
    exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

unzip -o "$CERT_ZIP" -d "$TMP_DIR" >/dev/null

CERT_DIR="$(find "$TMP_DIR" -maxdepth 3 -type f -name 'linlay.store_bundle.crt' -exec dirname {} \; | head -n 1)"
if [[ -z "$CERT_DIR" ]]; then
    echo "Could not find linlay.store_bundle.crt in $CERT_ZIP" >&2
    exit 1
fi

CERT_FILE="$CERT_DIR/linlay.store_bundle.crt"
KEY_FILE="$CERT_DIR/linlay.store.key"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
    echo "Certificate bundle or key missing after unzip." >&2
    exit 1
fi

openssl x509 -in "$CERT_FILE" -noout -subject -issuer -dates >/dev/null
openssl rsa -in "$KEY_FILE" -check -noout >/dev/null

export SSHPASS="$SSH_PASSWORD"
REMOTE_HOME="/home/$SSH_USER"

sshpass -e scp -o StrictHostKeyChecking=no \
    "$CERT_FILE" \
    "$KEY_FILE" \
    "$NGINX_CONF" \
    "$SSH_USER@$HOST:$REMOTE_HOME/"

sshpass -e ssh -o StrictHostKeyChecking=no "$SSH_USER@$HOST" "bash -s" -- "$SSH_PASSWORD" "$SSH_USER" <<'REMOTE'
set -euo pipefail

PASSWORD="$1"
SSH_USER="$2"

sudo_cmd() {
    printf '%s\n' "$PASSWORD" | sudo -S -p '' "$@"
}

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SITE_CONF="/etc/nginx/sites-available/engarde-ai"
SITE_LINK="/etc/nginx/sites-enabled/engarde-ai"
SSL_DIR="/etc/nginx/ssl"

sudo_cmd mkdir -p "$SSL_DIR"

if [[ -f "$SITE_CONF" ]]; then
    sudo_cmd cp "$SITE_CONF" "${SITE_CONF}.bak-${TIMESTAMP}"
fi

sudo_cmd install -m 644 "/home/$SSH_USER/linlay.store_bundle.crt" "$SSL_DIR/linlay.store_bundle.crt"
sudo_cmd install -m 600 "/home/$SSH_USER/linlay.store.key" "$SSL_DIR/linlay.store.key"
sudo_cmd install -m 644 "/home/$SSH_USER/engarde-https.conf" "$SITE_CONF"

if [[ ! -L "$SITE_LINK" ]]; then
    sudo_cmd ln -sf "$SITE_CONF" "$SITE_LINK"
fi

sudo_cmd nginx -t
sudo_cmd systemctl reload nginx
sudo_cmd sh -lc "ss -ltnp | egrep ':(80|443)\b' || true"

rm -f "/home/$SSH_USER/linlay.store_bundle.crt" "/home/$SSH_USER/linlay.store.key" "/home/$SSH_USER/engarde-https.conf"
REMOTE
