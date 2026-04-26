#!/usr/bin/env bash
#
# SmartKanban — one-click installer for production VPS
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash
#
# Or after cloning:
#   ./scripts/install.sh
#
# Walks through: prereq install (docker, git), repo clone, env config,
# schema init, container start, smoke test, and optional Caddy reverse
# proxy with auto-HTTPS.
#
# Re-runnable. Targets Debian 12 / Ubuntu 22.04+. Tested on 1 GB RAM VPS.

set -euo pipefail

# ---------- helpers ----------

C_RESET="\033[0m"
C_BOLD="\033[1m"
C_RED="\033[31m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_BLUE="\033[34m"

step()   { printf "\n${C_BOLD}${C_BLUE}==>${C_RESET} ${C_BOLD}%s${C_RESET}\n" "$*"; }
info()   { printf "    %s\n" "$*"; }
ok()     { printf "    ${C_GREEN}✓${C_RESET} %s\n" "$*"; }
warn()   { printf "    ${C_YELLOW}!${C_RESET} %s\n" "$*"; }
die()    { printf "${C_RED}✗ %s${C_RESET}\n" "$*" >&2; exit 1; }

# When run via `curl | bash`, stdin is the script itself — `read` would
# consume script lines as user input. Always read from /dev/tty.
if [[ ! -t 0 || ! -e /dev/tty ]]; then
  TTY_AVAILABLE=false
else
  TTY_AVAILABLE=true
fi

ask() {
  local prompt="$1" default="${2:-}" answer
  if [[ "$TTY_AVAILABLE" != "true" ]]; then
    echo "${default}"
    return
  fi
  if [[ -n "$default" ]]; then
    read -r -p "    $prompt [$default]: " answer </dev/tty
    echo "${answer:-$default}"
  else
    read -r -p "    $prompt: " answer </dev/tty
    echo "$answer"
  fi
}

ask_secret() {
  local prompt="$1" answer
  if [[ "$TTY_AVAILABLE" != "true" ]]; then
    echo ""
    return
  fi
  read -r -s -p "    $prompt: " answer </dev/tty; echo
  echo "$answer"
}

ask_yn() {
  local prompt="$1" default="${2:-y}" answer
  if [[ "$TTY_AVAILABLE" != "true" ]]; then
    [[ "$default" == "y" ]]
    return
  fi
  read -r -p "    $prompt [${default}/$( [[ $default == y ]] && echo n || echo y )]: " answer </dev/tty
  answer="${answer:-$default}"
  [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
}

need_sudo() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# ---------- pre-flight ----------

step "SmartKanban installer"
info "This script will install Docker, clone the repo, configure"
info "environment, build + run the app, and (optionally) set up Caddy"
info "for HTTPS. It uses sudo when needed and is safe to re-run."

# OS detect
if [[ ! -f /etc/os-release ]]; then
  die "cannot detect OS — only Debian/Ubuntu supported"
fi
. /etc/os-release
case "${ID:-unknown}" in
  debian|ubuntu) ok "detected $PRETTY_NAME" ;;
  *) die "unsupported distro: ${ID:-unknown}. Only Debian/Ubuntu supported." ;;
esac

# Sudo check
if [[ $EUID -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    die "sudo not available — run as root or install sudo"
  fi
  # Touch the sudo timestamp so subsequent calls don't prompt mid-script
  sudo -v || die "sudo authentication failed"
fi

# ---------- step 1: prereqs ----------

step "Step 1/8 — installing prerequisites"

need_sudo apt-get update -qq
PKGS=(ca-certificates curl gnupg lsb-release git ufw openssl)
for pkg in "${PKGS[@]}"; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    info "installing $pkg…"
    need_sudo apt-get install -y -qq "$pkg" >/dev/null
  fi
done
ok "base packages installed"

# Docker
if ! command -v docker >/dev/null 2>&1; then
  info "installing Docker…"
  need_sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" \
    | need_sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} $(lsb_release -cs) stable" \
    | need_sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  need_sudo apt-get update -qq
  need_sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null
  need_sudo usermod -aG docker "$USER" || true
  ok "Docker installed (you may need to log out/in for group membership)"
else
  ok "Docker already installed: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  die "docker compose plugin not working — re-run installer or check Docker install"
fi

# ---------- step 2: pick install dir + clone ----------

step "Step 2/8 — repository location"

DEFAULT_DIR="$HOME/smartkanban"
INSTALL_DIR="$(ask "Install directory" "$DEFAULT_DIR")"
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"   # expand ~

# If under /opt or other root-owned path, bootstrap with sudo
PARENT_DIR="$(dirname "$INSTALL_DIR")"
if [[ ! -w "$PARENT_DIR" && ! -d "$INSTALL_DIR" ]]; then
  info "$PARENT_DIR not writable — using sudo to create + chown"
  need_sudo mkdir -p "$INSTALL_DIR"
  need_sudo chown "$USER:$USER" "$INSTALL_DIR"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  ok "repo already present at $INSTALL_DIR — pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
else
  mkdir -p "$INSTALL_DIR"
  if [[ -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    git clone https://github.com/chatwithllm/SmartKanban.git "$INSTALL_DIR"
    ok "cloned into $INSTALL_DIR"
  else
    die "$INSTALL_DIR exists, is not empty, and is not a git repo. Pick a different path."
  fi
fi

cd "$INSTALL_DIR"

# ---------- step 3: firewall ----------

step "Step 3/8 — firewall"

if command -v ufw >/dev/null 2>&1; then
  if need_sudo ufw status | grep -q "Status: active"; then
    ok "ufw already active"
  else
    if ask_yn "Enable UFW with rules for SSH/80/443?" "y"; then
      need_sudo ufw allow OpenSSH >/dev/null
      need_sudo ufw allow 80/tcp >/dev/null
      need_sudo ufw allow 443/tcp >/dev/null
      need_sudo ufw --force enable >/dev/null
      ok "ufw enabled (SSH + 80 + 443)"
    else
      warn "skipping firewall — make sure ports 80/443 are reachable"
    fi
  fi
fi

# ---------- step 4: env config ----------

step "Step 4/8 — environment configuration"

ENV_FILE="$INSTALL_DIR/server/.env"
EXAMPLE_FILE="$INSTALL_DIR/.env.example"

if [[ -f "$ENV_FILE" ]]; then
  if ! ask_yn "server/.env already exists — overwrite?" "n"; then
    info "keeping existing $ENV_FILE"
    SKIP_ENV=true
  else
    SKIP_ENV=false
  fi
else
  SKIP_ENV=false
fi

if [[ "${SKIP_ENV:-false}" != "true" ]]; then
  APP_URL="$(ask "Public app URL (https://kanban.example.com or http://localhost:3001)" "http://localhost:3001")"
  COOKIE_SECRET="$(openssl rand -hex 32)"

  TELEGRAM_BOT_TOKEN=""
  TELEGRAM_GROUP_ID=""
  TELEGRAM_WEBHOOK_URL=""
  TELEGRAM_WEBHOOK_SECRET=""
  if ask_yn "Enable Telegram bot?" "y"; then
    TELEGRAM_BOT_TOKEN="$(ask "Telegram bot token (from @BotFather)" "")"
    TELEGRAM_GROUP_ID="$(ask "Telegram family group id (negative number)" "")"
    if [[ "$APP_URL" == https://* ]]; then
      TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 16)"
      TELEGRAM_WEBHOOK_URL="${APP_URL}/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}"
      info "webhook URL: $TELEGRAM_WEBHOOK_URL"
    else
      info "no HTTPS URL → bot will use long-poll mode"
    fi
  fi

  OPENROUTER_API_KEY=""
  if ask_yn "Configure OpenRouter (AI proposal flow, vision, weekly summary)?" "y"; then
    OPENROUTER_API_KEY="$(ask "OpenRouter API key (sk-or-v1-…) or leave blank to skip" "")"
  fi

  OPENAI_API_KEY=""
  if ask_yn "Configure OpenAI (Whisper voice transcription + AI fallback)?" "n"; then
    OPENAI_API_KEY="$(ask "OpenAI API key (sk-…) or leave blank to skip" "")"
  fi

  ENABLE_KNOWLEDGE_EMBEDDINGS="false"
  if [[ -n "$OPENAI_API_KEY" ]] && ask_yn "Enable semantic search for knowledge items (pgvector + embeddings)?" "n"; then
    ENABLE_KNOWLEDGE_EMBEDDINGS="true"
  fi

  cat > "$ENV_FILE" <<EOF
# Generated by scripts/install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
DATABASE_URL=postgres://kanban:kanban@db:5432/kanban
PORT=3001
COOKIE_SECRET=$COOKIE_SECRET
APP_URL=$APP_URL
OPEN_SIGNUP=true

TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_GROUP_ID=$TELEGRAM_GROUP_ID
TELEGRAM_WEBHOOK_URL=$TELEGRAM_WEBHOOK_URL
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET

OPENROUTER_API_KEY=$OPENROUTER_API_KEY
OPENROUTER_MODEL=google/gemini-2.0-flash-001
OPENROUTER_VISION_MODEL=google/gemini-2.0-flash-001

OPENAI_API_KEY=$OPENAI_API_KEY

KNOWLEDGE_AUTOFETCH=true
KNOWLEDGE_EMBEDDINGS=$ENABLE_KNOWLEDGE_EMBEDDINGS
EOF
  chmod 600 "$ENV_FILE"
  ok "wrote $ENV_FILE (mode 600)"
fi

# ---------- step 5: database ----------

step "Step 5/8 — Postgres + schema"

# Need to call docker via sudo if user isn't yet in docker group (fresh install)
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    warn "docker requires sudo (group membership not active in this shell)"
  else
    die "docker daemon not reachable"
  fi
fi

$DOCKER compose up -d db
info "waiting for Postgres to be healthy…"
for i in {1..30}; do
  if $DOCKER compose ps db --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    ok "Postgres healthy"; break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then die "Postgres did not become healthy in 60s"; fi
done

info "applying schema (idempotent)…"
$DOCKER exec -i kanbanclaude-db-1 psql -U kanban -d kanban < server/schema.sql >/dev/null
ok "schema applied"

if [[ -f "$ENV_FILE" ]] && grep -q '^KNOWLEDGE_EMBEDDINGS=true' "$ENV_FILE"; then
  info "enabling pgvector extension…"
  $DOCKER exec -i kanbanclaude-db-1 psql -U kanban -d kanban -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null || warn "pgvector failed to install — install manually with: docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
  ok "pgvector enabled"
fi

# ---------- step 6: build + start ----------

step "Step 6/8 — building and starting the server"

$DOCKER compose up -d --build server
info "waiting for server to listen on 3001…"
for i in {1..30}; do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    ok "server healthy: $(curl -s http://localhost:3001/health)"; break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    warn "server didn't respond on /health in 60s"
    info "check logs: $DOCKER compose logs --tail=100 server"
  fi
done

# ---------- step 7: optional Caddy ----------

step "Step 7/8 — reverse proxy + HTTPS"

APP_URL_FROM_ENV="$(grep '^APP_URL=' "$ENV_FILE" | cut -d= -f2-)"
if [[ "$APP_URL_FROM_ENV" == https://* ]]; then
  HOST="${APP_URL_FROM_ENV#https://}"
  HOST="${HOST%%/*}"
  if ask_yn "Install + configure Caddy for $HOST (auto-HTTPS via Let's Encrypt)?" "y"; then
    if ! command -v caddy >/dev/null 2>&1; then
      need_sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | need_sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | need_sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
      need_sudo apt-get update -qq
      need_sudo apt-get install -y -qq caddy >/dev/null
      ok "Caddy installed"
    else
      ok "Caddy already installed"
    fi

    CADDYFILE="/etc/caddy/Caddyfile"
    if grep -q "$HOST" "$CADDYFILE" 2>/dev/null; then
      ok "Caddyfile already mentions $HOST — leaving alone"
    else
      need_sudo tee -a "$CADDYFILE" >/dev/null <<EOF

$HOST {
    encode zstd gzip
    reverse_proxy localhost:3001
}
EOF
      need_sudo systemctl reload caddy
      ok "Caddy reloaded — HTTPS will provision on first request"
    fi
  fi
else
  info "APP_URL is not HTTPS — skipping Caddy setup."
  info "If you'd like HTTPS later, edit $ENV_FILE and re-run this script,"
  info "or follow docs/DEPLOYMENT.md."
fi

# ---------- step 8: backups ----------

step "Step 8/8 — backups (optional)"

if ask_yn "Set up daily 3am backup cron job?" "y"; then
  BACKUP_DIR="$(ask "Backup target directory" "/var/backups/smartkanban")"
  need_sudo mkdir -p "$BACKUP_DIR"
  need_sudo chown "$USER:$USER" "$BACKUP_DIR"
  CRON_LINE="0 3 * * *  $INSTALL_DIR/scripts/backup.sh $BACKUP_DIR"
  ( crontab -l 2>/dev/null | grep -v "$INSTALL_DIR/scripts/backup.sh" ; echo "$CRON_LINE" ) | crontab -
  ok "cron installed: $CRON_LINE"
  info "first backup test: $INSTALL_DIR/scripts/backup.sh $BACKUP_DIR"
fi

# ---------- summary ----------

step "Done!"
ok "SmartKanban is running."
echo
echo "  ${C_BOLD}Local URL:${C_RESET}     http://localhost:3001"
[[ "$APP_URL_FROM_ENV" == https://* ]] && echo "  ${C_BOLD}Public URL:${C_RESET}    $APP_URL_FROM_ENV"
echo "  ${C_BOLD}Install dir:${C_RESET}   $INSTALL_DIR"
echo "  ${C_BOLD}Env file:${C_RESET}      $ENV_FILE"
echo
echo "  Next steps:"
echo "    1. Open the URL in a browser and register the first user."
echo "    2. Settings → Telegram identities: link your Telegram id."
echo "    3. After everyone is registered: edit $ENV_FILE,"
echo "       set OPEN_SIGNUP=false, then: $DOCKER compose restart server"
echo "    4. Tail logs: $DOCKER compose logs -f server"
echo
echo "  Full guide: $INSTALL_DIR/docs/DEPLOYMENT.md"
echo "  Troubleshooting: $INSTALL_DIR/docs/DEPLOYMENT.md#troubleshooting"
