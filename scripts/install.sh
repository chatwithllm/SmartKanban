#!/usr/bin/env bash
#
# SmartKanban — installer / upgrade / uninstall / status
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash
#
#   ./scripts/install.sh [install|upgrade|uninstall|status|-h|--help]
#
# No-arg: auto-detects existing install and presents a menu.

set -euo pipefail

# ---------- colour / output helpers ----------

# B3: use ANSI-C quoting so variables hold real ESC bytes
C_RESET=$'\033[0m'
C_BOLD=$'\033[1m'
C_RED=$'\033[31m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_BLUE=$'\033[34m'

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

# ---------- usage ----------

usage() {
  cat <<EOF

${C_BOLD}SmartKanban installer${C_RESET}

  ${C_BOLD}Synopsis:${C_RESET}
    install.sh [action] [options]

  ${C_BOLD}Actions:${C_RESET}
    install     Fresh install: prereqs, clone, env config, schema, start, Caddy, cron, bridge docs
    upgrade     Pull latest, re-apply schema, rebuild server, restart — skips already-configured steps
    uninstall   Stop containers; optionally remove data, install dir, cron, Caddy config
    status      Print install state, container status, version and last upgrade time
    (no args)   Auto-detect state and show interactive menu

  ${C_BOLD}Options:${C_RESET}
    -h, --help  Print this help and exit

  ${C_BOLD}Examples:${C_RESET}
    # New machine — interactive
    ./scripts/install.sh

    # Force fresh install
    ./scripts/install.sh install

    # Upgrade a running instance
    ./scripts/install.sh upgrade

    # Just show what's installed
    ./scripts/install.sh status

    # Via curl (non-interactive fresh install with defaults)
    curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash

EOF
}

# ---------- detect helpers ----------

# resolve_docker — sets global $DOCKER variable
resolve_docker() {
  DOCKER="docker"
  if ! docker info >/dev/null 2>&1; then
    if sudo docker info >/dev/null 2>&1; then
      DOCKER="sudo docker"
      warn "docker requires sudo (group membership not active in this shell)"
    else
      die "docker daemon not reachable"
    fi
  fi
}

# detect_install_state — takes the install dir as $1 and echoes one of:
#   new | up-to-date | behind | ahead | diverged | broken
# Does NOT write to any globals.
detect_install_state() {
  local dir="$1"

  # No directory at all (or empty)
  if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    echo "new"
    return
  fi

  # Directory exists but no .git
  if [[ ! -d "$dir/.git" ]]; then
    echo "broken"
    return
  fi

  # Fetch quietly to update remote refs
  if ! git -C "$dir" fetch --quiet origin 2>/dev/null; then
    # Network unavailable — treat as broken only if we cannot read HEAD
    if ! git -C "$dir" rev-parse HEAD >/dev/null 2>&1; then
      echo "broken"
      return
    fi
    # Offline but we have a local repo — call it up-to-date (best guess)
    echo "up-to-date"
    return
  fi

  local local_sha origin_sha merge_base
  local_sha="$(git -C "$dir" rev-parse HEAD 2>/dev/null)"
  origin_sha="$(git -C "$dir" rev-parse origin/main 2>/dev/null || true)"

  if [[ -z "$origin_sha" ]]; then
    echo "broken"
    return
  fi

  if [[ "$local_sha" == "$origin_sha" ]]; then
    echo "up-to-date"
    return
  fi

  merge_base="$(git -C "$dir" merge-base HEAD origin/main 2>/dev/null || true)"

  if [[ "$merge_base" == "$local_sha" ]]; then
    echo "behind"
  elif [[ "$merge_base" == "$origin_sha" ]]; then
    echo "ahead"
  else
    echo "diverged"
  fi
}

# resolve_install_dir — resolves and sets the global INSTALL_DIR.
# Honours existing INSTALL_DIR if set; otherwise asks or uses default.
resolve_install_dir() {
  if [[ -z "${INSTALL_DIR:-}" ]]; then
    local default_dir="$HOME/smartkanban"
    if [[ -d "$default_dir" ]]; then
      INSTALL_DIR="$default_dir"
    elif [[ "$TTY_AVAILABLE" == "true" ]]; then
      INSTALL_DIR="$(ask "Install directory to check" "$default_dir")"
      INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
    else
      INSTALL_DIR="$default_dir"
    fi
  fi
}

# ---------- wait helpers (I5) ----------

wait_for_pg() {
  info "waiting for Postgres to be healthy…"
  for i in {1..30}; do
    if $DOCKER compose ps db --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
      ok "Postgres healthy"; return 0
    fi
    if $DOCKER compose exec -T db pg_isready -U kanban >/dev/null 2>&1; then
      ok "Postgres ready (pg_isready)"; return 0
    fi
    sleep 2
  done
  die "Postgres did not become healthy in 60s"
}

wait_for_health() {
  info "waiting for server to listen on 3001…"
  for i in {1..30}; do
    if /usr/bin/curl -sf http://localhost:3001/health >/dev/null 2>&1; then
      ok "server healthy"; return 0
    fi
    sleep 2
  done
  die "server did not become healthy in 60s"
}

# ---------- do_status ----------

do_status() {
  step "SmartKanban status"

  # B1: resolve INSTALL_DIR in the caller before the subshell call
  INSTALL_DIR="${INSTALL_DIR:-$HOME/smartkanban}"
  local state
  state="$(detect_install_state "$INSTALL_DIR")"

  info "Install directory : ${INSTALL_DIR}"
  info "Install state     : ${state}"

  if [[ "$state" == "new" ]]; then
    info "No installation found at ${INSTALL_DIR}."
    return
  fi

  if [[ "$state" == "broken" ]]; then
    warn "Directory exists but is not a valid git repo."
    return
  fi

  # Git info
  local local_sha local_date
  local_sha="$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  local_date="$(git -C "$INSTALL_DIR" log -1 --format='%ci' 2>/dev/null || echo unknown)"
  info "Current commit    : ${local_sha} (${local_date})"

  # B2: Docker / container status — use docker compose ps directly
  if command -v docker >/dev/null 2>&1 || command -v sudo >/dev/null 2>&1; then
    resolve_docker 2>/dev/null || true
    if [[ -f "$INSTALL_DIR/docker-compose.yml" || -f "$INSTALL_DIR/compose.yml" ]]; then
      info ""
      info "Container status:"
      local compose_file
      if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        compose_file="$INSTALL_DIR/docker-compose.yml"
      else
        compose_file="$INSTALL_DIR/compose.yml"
      fi
      $DOCKER compose -f "$compose_file" --project-directory "$INSTALL_DIR" \
        ps --format '{{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null \
        || warn "docker compose not reachable"
    fi
  fi

  # Server health
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    ok "Server /health: $(curl -s http://localhost:3001/health)"
  else
    warn "Server not responding on http://localhost:3001/health"
  fi
}

# ---------- do_print_bridge_docs ----------

do_print_bridge_docs() {
  local public_url="${1:-}"
  if [[ -z "$public_url" ]]; then
    local env_file="${INSTALL_DIR}/server/.env"
    if [[ -f "$env_file" ]]; then
      public_url="$(grep '^APP_URL=' "$env_file" | cut -d= -f2- || true)"
    fi
    public_url="${public_url:-http://$(hostname -f 2>/dev/null || hostname):3001}"
  fi

  cat <<EOF

  ${C_BOLD}Share these steps with each developer:${C_RESET}

  1. Install the bridge on their machine (one-time):
       git clone https://github.com/chatwithllm/notetaker-kanban.git ~/.notetaker-kanban
       cd ~/.notetaker-kanban && ./install.sh

  2. Open this kanban in a browser, log in, then:
       Settings → API tokens → Generate → copy the token

  3. Add to ~/.zshrc (or ~/.bashrc):
       export KANBAN_URL=${public_url}
       export KANBAN_TOKEN=<paste-token-here>
     Reload: source ~/.zshrc

  4. Restart any open Claude Code sessions (env captured at startup).

  5. In any git repo:
       claude
       /kanban-start

  Bridge repo + full command list:
    https://github.com/chatwithllm/notetaker-kanban

EOF
}

# ---------- do_upgrade ----------

do_upgrade() {
  step "Upgrading SmartKanban"

  if [[ -z "${INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$HOME/smartkanban"
  fi

  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    die "No git repo found at $INSTALL_DIR — cannot upgrade. Run 'install' first."
  fi

  # I4: short-circuit when already up-to-date
  local state
  state="$(detect_install_state "$INSTALL_DIR")"
  if [[ "$state" == "up-to-date" ]]; then
    ok "Already up to date."
    if ask_yn "Re-print bridge onboarding for new team members?" "n"; then
      do_print_bridge_docs
    fi
    return 0
  fi

  resolve_docker

  step "Pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
  ok "repo updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"

  step "Applying schema (idempotent)"
  cd "$INSTALL_DIR"
  # Ensure db is running
  $DOCKER compose up -d db
  wait_for_pg
  $DOCKER compose exec -T db psql -U kanban -d kanban < server/schema.sql >/dev/null
  ok "schema applied"

  step "Rebuilding + restarting server"
  $DOCKER compose up -d --build server
  wait_for_health
  ok "server healthy: $(curl -s http://localhost:3001/health)"

  ok "Upgrade complete."

  if ask_yn "Re-print bridge onboarding for new team members?" "n"; then
    do_print_bridge_docs
  fi
}

# ---------- do_uninstall ----------

do_uninstall() {
  # I8: refuse to run without a TTY
  if [[ "${TTY_AVAILABLE:-true}" != "true" ]]; then
    die "uninstall requires interactive terminal — re-run from a TTY (not via curl|bash)"
  fi

  step "Uninstall SmartKanban"
  warn "this stops the kanban containers and may remove data."

  if [[ -z "${INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$HOME/smartkanban"
  fi

  resolve_docker 2>/dev/null || DOCKER="docker"

  if ask_yn "Stop running containers (docker compose down)?" "y"; then
    if [[ -d "$INSTALL_DIR" ]]; then
      ( cd "$INSTALL_DIR" && $DOCKER compose down ) || warn "docker compose down failed (containers may already be stopped)"
      ok "containers stopped"
    else
      warn "$INSTALL_DIR not found — skipping docker compose down"
    fi
  fi

  # I7: volume rm with if/else instead of broken ||
  if ask_yn "Remove database volume? THIS DELETES ALL CARDS." "n"; then
    if $DOCKER volume rm "$(basename "$INSTALL_DIR")_db_data" 2>/dev/null; then
      ok "database volume removed"
    else
      warn "database volume not found or could not be removed"
    fi
  fi

  if ask_yn "Remove install dir at $INSTALL_DIR?" "n"; then
    rm -rf "$INSTALL_DIR"
    ok "removed $INSTALL_DIR"
  fi

  # I6: cron gate — check applicability before prompting
  if crontab -l 2>/dev/null | grep -q "$INSTALL_DIR/scripts/backup.sh"; then
    if ask_yn "Remove backup cron entry?" "y"; then
      crontab -l 2>/dev/null | grep -v "$INSTALL_DIR/scripts/backup.sh" | crontab -
      ok "cron entry removed"
    fi
  else
    info "no backup cron entry found, skipping"
  fi

  # I6: caddy gate — check applicability before prompting
  if [[ -f /etc/caddy/sites-enabled/smartkanban ]] || sudo test -f /etc/caddy/sites-enabled/smartkanban 2>/dev/null; then
    if ask_yn "Remove Caddy site config?" "y"; then
      sudo rm -f /etc/caddy/sites-enabled/smartkanban
      sudo systemctl reload caddy 2>/dev/null || true
      ok "caddy config removed"
    fi
  else
    info "no Caddy site config found, skipping"
    # Still warn about inline Caddyfile block if present
    if [[ -f /etc/caddy/Caddyfile ]] && grep -q 'reverse_proxy localhost:3001' /etc/caddy/Caddyfile; then
      warn "Caddyfile block for port 3001 detected — remove manually from /etc/caddy/Caddyfile"
    fi
  fi

  ok "Uninstall complete."
}

# ---------- do_install ----------

do_install() {
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

  step "Step 1/9 — installing prerequisites"

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

  step "Step 2/9 — repository location"

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

  step "Step 3/9 — firewall"

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

  step "Step 4/9 — environment configuration"

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

  step "Step 5/9 — Postgres + schema"

  resolve_docker

  $DOCKER compose up -d db
  wait_for_pg

  info "applying schema (idempotent)…"
  $DOCKER compose exec -T db psql -U kanban -d kanban < server/schema.sql >/dev/null
  ok "schema applied"

  if [[ -f "$ENV_FILE" ]] && grep -q '^KNOWLEDGE_EMBEDDINGS=true' "$ENV_FILE"; then
    info "enabling pgvector extension…"
    $DOCKER compose exec -T db psql -U kanban -d kanban -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null || warn "pgvector failed to install — install manually with: docker compose exec -T db psql -U kanban -d kanban -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
    ok "pgvector enabled"
  fi

  # ---------- step 6: build + start ----------

  step "Step 6/9 — building and starting the server"

  $DOCKER compose up -d --build server
  wait_for_health
  ok "server healthy: $(curl -s http://localhost:3001/health)"

  # ---------- step 7: optional Caddy ----------

  step "Step 7/9 — reverse proxy + HTTPS"

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

  step "Step 8/9 — backups (optional)"

  if ask_yn "Set up daily 3am backup cron job?" "y"; then
    BACKUP_DIR="$(ask "Backup target directory" "/var/backups/smartkanban")"
    need_sudo mkdir -p "$BACKUP_DIR"
    need_sudo chown "$USER:$USER" "$BACKUP_DIR"
    CRON_LINE="0 3 * * *  $INSTALL_DIR/scripts/backup.sh $BACKUP_DIR"
    ( crontab -l 2>/dev/null | grep -v "$INSTALL_DIR/scripts/backup.sh" ; echo "$CRON_LINE" ) | crontab -
    ok "cron installed: $CRON_LINE"
    info "first backup test: $INSTALL_DIR/scripts/backup.sh $BACKUP_DIR"
  fi

  # ---------- step 9: notetaker-kanban (optional) ----------

  step "Step 9/9 — notetaker-kanban bridge (optional)"

  info "notetaker-kanban auto-records Claude Code dev sessions into kanban:"
  info "  • /kanban-start in any repo → creates card from git history"
  info "  • /kanban-deployed-local, /kanban-deployed-prod → lifecycle tags"
  info "  • /kanban-flush → session summary appended to card activity"
  info ""
  info "Each developer installs the bridge ON THEIR OWN MACHINE — this server"
  info "host doesn't run the bridge itself, it only serves the API."

  if ask_yn "Print developer onboarding instructions to share with your team?" "y"; then
    do_print_bridge_docs "$APP_URL_FROM_ENV"
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
}

# ---------- interactive menu ----------

interactive_menu() {
  local state="$1"

  echo
  info "What would you like to do?"
  info "  1) Upgrade (pull + rebuild + apply schema)"
  info "  2) Uninstall"
  info "  3) Re-print developer onboarding (notetaker bridge)"
  info "  4) Status only"
  info "  5) Quit"

  local choice
  choice="$(ask "Choice" "1")"

  case "$choice" in
    1) do_upgrade ;;
    2) do_uninstall ;;
    3) do_print_bridge_docs ;;
    4) do_status ;;
    5) info "Quit."; exit 0 ;;
    *) warn "Unknown choice '$choice' — exiting."; exit 1 ;;
  esac
}

# ---------- main ----------

main() {
  ACTION="${1:-auto}"

  case "$ACTION" in
    install|upgrade|uninstall|status|auto) ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown action: $ACTION. Run with --help for usage." ;;
  esac

  if [[ "$ACTION" == "auto" ]]; then
    # B1: resolve INSTALL_DIR in the caller before the subshell call
    resolve_install_dir
    local state
    state="$(detect_install_state "$INSTALL_DIR")"

    case "$state" in
      new)
        step "SmartKanban — no existing install detected"
        info "Install directory: ${INSTALL_DIR}"
        if ask_yn "Proceed with new install?" "y"; then
          do_install
        else
          info "Aborted."
          exit 0
        fi
        ;;
      up-to-date)
        ok "Existing install at $INSTALL_DIR is up to date."
        interactive_menu "$state"
        ;;
      behind)
        warn "Existing install at $INSTALL_DIR is behind origin/main — upgrade recommended."
        interactive_menu "$state"
        ;;
      ahead)
        warn "Existing install at $INSTALL_DIR is ahead of origin/main (local commits present)."
        interactive_menu "$state"
        ;;
      diverged)
        warn "Existing install at $INSTALL_DIR has diverged from origin/main."
        warn "Upgrade will attempt --ff-only and may fail. Review git status manually."
        interactive_menu "$state"
        ;;
      broken)
        warn "Directory $INSTALL_DIR exists but is not a valid git repo."
        info "Options: pick a different INSTALL_DIR, or remove $INSTALL_DIR and re-run to install fresh."
        interactive_menu "$state"
        ;;
    esac

  elif [[ "$ACTION" == "install" ]]; then
    do_install

  elif [[ "$ACTION" == "upgrade" ]]; then
    do_upgrade

  elif [[ "$ACTION" == "uninstall" ]]; then
    do_uninstall

  elif [[ "$ACTION" == "status" ]]; then
    do_status
  fi
}

main "$@"
