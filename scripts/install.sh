#!/usr/bin/env bash
#
# SmartKanban — installer / upgrade / uninstall / status
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash
#
#   ./scripts/install.sh [server|client|install|upgrade|uninstall|status|-h|--help]
#
# Sides:
#   server  — kanban backend (Docker + Postgres on a host machine)
#   client  — notetaker-kanban bridge (slash commands + hooks on dev laptop)
#
# No-arg: auto-detects existing install(s) and presents a menu.

set -euo pipefail

INSTALLER_VERSION="2026-04-27.upgrade-branch-fix-v7"

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
# We only need /dev/tty to be readable; stdin being non-TTY (because the
# script is piped from curl) is expected and not a reason to skip prompts.
if [[ -e /dev/tty ]] && { : >/dev/tty; } 2>/dev/null; then
  TTY_AVAILABLE=true
else
  TTY_AVAILABLE=false
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
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
  [[ "$answer" == "y" || "$answer" == "yes" ]]
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
    install.sh [side] [action] [options]

  ${C_BOLD}Sides:${C_RESET}
    server      Target the kanban backend (Docker + Postgres on a host machine)
    client      Target the notetaker-kanban bridge (slash commands + hooks on dev laptop)
    (no side)   Auto-detect which side(s) are installed and prompt if ambiguous

  ${C_BOLD}Actions:${C_RESET}
    install     Fresh install: prereqs, clone, env config, schema, start, Caddy, cron, bridge docs
    upgrade     Pull latest, re-apply schema, rebuild server, restart — skips already-configured steps
    uninstall   Stop containers; optionally remove data, install dir, cron, Caddy config
    status      Print install state, container status, version and last upgrade time
    explain     Browse slash commands (wiki mode — requires client install)
    (no args)   Auto-detect state and show interactive menu

  ${C_BOLD}Options:${C_RESET}
    -h, --help  Print this help and exit

  ${C_BOLD}Examples:${C_RESET}
    # New machine — interactive (prompts for server or client)
    ./scripts/install.sh

    # Force server install
    ./scripts/install.sh server

    # Install the notetaker-kanban bridge on a developer laptop
    ./scripts/install.sh client

    # Force fresh server install (back-compat)
    ./scripts/install.sh install

    # Upgrade a running server instance
    ./scripts/install.sh upgrade

    # Upgrade the notetaker-kanban bridge
    ./scripts/install.sh client upgrade

    # Just show what's installed (both sides)
    ./scripts/install.sh status

    # Tour all slash commands
    ./scripts/install.sh explain

    # Via curl (non-interactive fresh server install with defaults)
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

# detect_server_state — takes the install dir as $1 and echoes one of:
#   new | up-to-date | behind | ahead | diverged | broken
# Does NOT write to any globals.
detect_server_state() {
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

  # Must be a SmartKanban repo
  local remote_url
  remote_url="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" != *"chatwithllm/SmartKanban"* ]]; then
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

# detect_install_state — legacy alias kept for back-compat
detect_install_state() {
  detect_server_state "$@"
}

# detect_client_state — echoes one of:
#   not-installed | up-to-date | behind | broken
detect_client_state() {
  local symlink="$HOME/.claude/notetaker-kanban"

  # Symlink must exist
  if [[ ! -L "$symlink" ]]; then
    echo "not-installed"
    return
  fi

  # Symlink must resolve to a real directory
  local target
  target="$(readlink "$symlink" 2>/dev/null || true)"
  if [[ -z "$target" || ! -d "$target" ]]; then
    echo "broken"
    return
  fi

  # Must have a .git dir
  if [[ ! -d "$target/.git" ]]; then
    echo "broken"
    return
  fi

  # Must be the notetaker-kanban repo
  local remote_url
  remote_url="$(git -C "$target" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" != *"chatwithllm/notetaker-kanban"* ]]; then
    echo "broken"
    return
  fi

  # Fetch quietly
  if ! git -C "$target" fetch --quiet origin 2>/dev/null; then
    if ! git -C "$target" rev-parse HEAD >/dev/null 2>&1; then
      echo "broken"
      return
    fi
    echo "up-to-date"
    return
  fi

  local local_sha origin_sha merge_base
  local_sha="$(git -C "$target" rev-parse HEAD 2>/dev/null)"
  origin_sha="$(git -C "$target" rev-parse origin/main 2>/dev/null || true)"

  if [[ -z "$origin_sha" ]]; then
    echo "broken"
    return
  fi

  if [[ "$local_sha" == "$origin_sha" ]]; then
    echo "up-to-date"
    return
  fi

  merge_base="$(git -C "$target" merge-base HEAD origin/main 2>/dev/null || true)"

  if [[ "$merge_base" == "$local_sha" ]]; then
    echo "behind"
  else
    # ahead or diverged — still functional, report up-to-date
    echo "up-to-date"
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

# resolve_bridge_dir — resolves and sets the global BRIDGE_DIR.
# Prefers the target of the ~/.claude/notetaker-kanban symlink if it exists.
resolve_bridge_dir() {
  if [[ -z "${BRIDGE_DIR:-}" ]]; then
    local symlink="$HOME/.claude/notetaker-kanban"
    if [[ -L "$symlink" ]]; then
      local target
      target="$(readlink "$symlink" 2>/dev/null || true)"
      if [[ -n "$target" && -d "$target" ]]; then
        BRIDGE_DIR="$target"
        return
      fi
    fi
    BRIDGE_DIR="$HOME/.notetaker-kanban"
  fi
}

# ---------- wait helpers ----------

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

# ---------- detect_shell_rc ----------

detect_shell_rc() {
  local os="${1:-linux}"
  case "$SHELL" in
    */zsh)  echo "$HOME/.zshrc" ;;
    */bash) [[ "$os" == "macos" ]] && echo "$HOME/.bash_profile" || echo "$HOME/.bashrc" ;;
    *)      echo "$HOME/.profile" ;;
  esac
}

# ---------- do_status ----------

do_status() {
  step "SmartKanban status"

  # --- Server side ---
  echo
  echo "${C_BOLD}Server:${C_RESET}"
  INSTALL_DIR="${INSTALL_DIR:-$HOME/smartkanban}"
  local server_state
  server_state="$(detect_server_state "$INSTALL_DIR")"

  info "  install dir: $INSTALL_DIR"
  info "  state: $server_state"

  if [[ "$server_state" == "new" ]]; then
    info "  not installed"
  elif [[ "$server_state" == "broken" ]]; then
    warn "  directory exists but is not a valid SmartKanban git repo"
  else
    # Git info
    local local_sha local_date
    local_sha="$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    local_date="$(git -C "$INSTALL_DIR" log -1 --format='%ci' 2>/dev/null || echo unknown)"
    info "  current commit: ${local_sha} (${local_date})"

    # Docker / container status
    if command -v docker >/dev/null 2>&1 || command -v sudo >/dev/null 2>&1; then
      resolve_docker 2>/dev/null || true
      if [[ -f "$INSTALL_DIR/docker-compose.yml" || -f "$INSTALL_DIR/compose.yml" ]]; then
        info ""
        info "  container status:"
        local compose_file
        if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
          compose_file="$INSTALL_DIR/docker-compose.yml"
        else
          compose_file="$INSTALL_DIR/compose.yml"
        fi
        $DOCKER compose -f "$compose_file" --project-directory "$INSTALL_DIR" \
          ps --format '{{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null \
          || warn "  docker compose not reachable"
      fi
    fi

    # Server health
    if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
      ok "  server /health: $(curl -s http://localhost:3001/health)"
    else
      warn "  server not responding on http://localhost:3001/health"
    fi
  fi

  # --- Client side ---
  echo
  echo "${C_BOLD}Client (notetaker-kanban bridge):${C_RESET}"
  local client_state
  client_state="$(detect_client_state)"

  case "$client_state" in
    not-installed)
      info "  not installed"
      ;;
    *)
      resolve_bridge_dir
      info "  bridge repo: $BRIDGE_DIR"
      info "  state: $client_state"
      info "  KANBAN_URL: ${KANBAN_URL:-<unset>}"
      info "  KANBAN_TOKEN: $([ -n "${KANBAN_TOKEN:-}" ] && echo "set (${#KANBAN_TOKEN} chars)" || echo "<unset>")"
      if [[ -n "${KANBAN_URL:-}" && -n "${KANBAN_TOKEN:-}" ]]; then
        local code
        code="$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" \
          -X POST "$KANBAN_URL/api/cards/00000000-0000-0000-0000-000000000000/activity" \
          -H "authorization: Bearer $KANBAN_TOKEN" \
          -H "content-type: application/json" \
          -d '{"type":"probe","body":"probe"}' 2>/dev/null || echo "000")"
        case "$code" in
          404) ok "  test connection: OK (token valid, api-scope)" ;;
          401) warn "  test connection: 401 — token invalid" ;;
          403) warn "  test connection: 403 — token wrong scope" ;;
          000) warn "  test connection: unreachable — server down or network issue" ;;
          *)   warn "  test connection: HTTP $code" ;;
        esac
      fi
      ;;
  esac
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
       ./install.sh client
       # — or manually —
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

# ---------- do_upgrade (server) ----------

do_upgrade() {
  step "Upgrading SmartKanban server"

  if [[ -z "${INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$HOME/smartkanban"
  fi

  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    die "No git repo found at $INSTALL_DIR — cannot upgrade. Run 'install' first."
  fi

  # Short-circuit when already up-to-date
  local state
  state="$(detect_server_state "$INSTALL_DIR")"
  if [[ "$state" == "up-to-date" ]]; then
    ok "Already up to date."
    if ask_yn "Re-print bridge onboarding for new team members?" "n"; then
      do_print_bridge_docs
    fi
    return 0
  fi

  resolve_docker

  step "Pulling latest"
  # Repo may be on a feature/fix branch left over from a prior hotfix
  # (e.g. fix/test-strict-undefined). Force back to main with tracking
  # set, otherwise `git pull` fails with "no tracking information".
  local current_branch
  current_branch="$(git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  if [[ "$current_branch" != "main" ]]; then
    warn "Repo is on '$current_branch' — switching to 'main' for upgrade."
    git -C "$INSTALL_DIR" fetch origin main
    # Stash any local changes so checkout doesn't fail
    if ! git -C "$INSTALL_DIR" diff --quiet || ! git -C "$INSTALL_DIR" diff --cached --quiet; then
      warn "Local changes detected — stashing before checkout."
      git -C "$INSTALL_DIR" stash push -u -m "auto-stash before installer upgrade $(date +%s)" >/dev/null
    fi
    git -C "$INSTALL_DIR" checkout main 2>/dev/null || git -C "$INSTALL_DIR" checkout -B main origin/main
    git -C "$INSTALL_DIR" branch --set-upstream-to=origin/main main 2>/dev/null || true
  fi
  git -C "$INSTALL_DIR" pull --ff-only origin main
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

# ---------- do_upgrade_client ----------

do_upgrade_client() {
  step "Upgrading notetaker-kanban bridge"

  resolve_bridge_dir

  if [[ ! -d "$BRIDGE_DIR/.git" ]]; then
    die "No bridge repo found at $BRIDGE_DIR — run 'client install' first."
  fi

  local current_branch
  current_branch="$(git -C "$BRIDGE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  if [[ "$current_branch" != "main" ]]; then
    warn "Bridge repo on '$current_branch' — switching to 'main'."
    git -C "$BRIDGE_DIR" fetch origin main
    if ! git -C "$BRIDGE_DIR" diff --quiet || ! git -C "$BRIDGE_DIR" diff --cached --quiet; then
      warn "Local changes detected — stashing."
      git -C "$BRIDGE_DIR" stash push -u -m "auto-stash before installer upgrade $(date +%s)" >/dev/null
    fi
    git -C "$BRIDGE_DIR" checkout main 2>/dev/null || git -C "$BRIDGE_DIR" checkout -B main origin/main
    git -C "$BRIDGE_DIR" branch --set-upstream-to=origin/main main 2>/dev/null || true
  fi
  git -C "$BRIDGE_DIR" pull --ff-only origin main
  ok "bridge repo updated"
  info "re-running bridge install.sh to refresh slash commands + hook"
  bash "$BRIDGE_DIR/install.sh"
  ok "bridge upgraded"
}

# ---------- do_uninstall (server) ----------

do_uninstall() {
  # Refuse to run without a TTY
  if [[ "${TTY_AVAILABLE:-true}" != "true" ]]; then
    die "uninstall requires interactive terminal — re-run from a TTY (not via curl|bash)"
  fi

  step "Uninstall SmartKanban server"
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

  if crontab -l 2>/dev/null | grep -q "$INSTALL_DIR/scripts/backup.sh"; then
    if ask_yn "Remove backup cron entry?" "y"; then
      crontab -l 2>/dev/null | grep -v "$INSTALL_DIR/scripts/backup.sh" | crontab -
      ok "cron entry removed"
    fi
  else
    info "no backup cron entry found, skipping"
  fi

  if [[ -f /etc/caddy/sites-enabled/smartkanban ]] || sudo test -f /etc/caddy/sites-enabled/smartkanban 2>/dev/null; then
    if ask_yn "Remove Caddy site config?" "y"; then
      sudo rm -f /etc/caddy/sites-enabled/smartkanban
      sudo systemctl reload caddy 2>/dev/null || true
      ok "caddy config removed"
    fi
  else
    info "no Caddy site config found, skipping"
    if [[ -f /etc/caddy/Caddyfile ]] && grep -q 'reverse_proxy localhost:3001' /etc/caddy/Caddyfile; then
      warn "Caddyfile block for port 3001 detected — remove manually from /etc/caddy/Caddyfile"
    fi
  fi

  ok "Server uninstall complete."
}

# ---------- do_uninstall_client ----------

do_uninstall_client() {
  step "Uninstalling notetaker-kanban bridge"

  if [[ "${TTY_AVAILABLE:-true}" != "true" ]]; then
    die "uninstall requires interactive terminal"
  fi

  resolve_bridge_dir

  # Run bridge's uninstall.sh if present
  if [[ -x "$BRIDGE_DIR/uninstall.sh" ]]; then
    if ask_yn "Run bridge uninstall.sh (removes ~/.claude/commands + hook + symlink)?" "y"; then
      bash "$BRIDGE_DIR/uninstall.sh"
    fi
  fi

  # Detect shell rc
  local os="linux"
  case "$(uname -s)" in
    Darwin) os="macos" ;;
  esac
  local RC_FILE
  RC_FILE="$(detect_shell_rc "$os")"

  # Remove KANBAN_URL/KANBAN_TOKEN from rc if present
  if grep -q "^export KANBAN_TOKEN=" "$RC_FILE" 2>/dev/null; then
    if ask_yn "Remove KANBAN_URL/KANBAN_TOKEN from $RC_FILE?" "y"; then
      /usr/bin/sed -i.bak \
        '/^export KANBAN_URL=/d; /^export KANBAN_TOKEN=/d; /^# notetaker-kanban (added by SmartKanban installer)$/d' \
        "$RC_FILE"
      rm -f "$RC_FILE.bak"
      ok "rc cleaned"
    fi
  else
    info "no KANBAN_URL/KANBAN_TOKEN in $RC_FILE, skipping"
  fi

  # Optional: remove bridge clone dir
  if [[ -d "$BRIDGE_DIR" ]]; then
    if ask_yn "Remove bridge clone at $BRIDGE_DIR?" "n"; then
      rm -rf "$BRIDGE_DIR"
      ok "$BRIDGE_DIR removed"
    fi
  fi

  ok "Client uninstall complete."
}

# ---------- do_install_client ----------

do_install_client() {
  step "Installing notetaker-kanban bridge"

  # OS detection
  local OS
  case "$(uname -s)" in
    Darwin) OS=macos ;;
    Linux)  OS=linux ;;
    *)      die "unsupported OS: $(uname -s)" ;;
  esac

  # Dep check
  for cmd in git curl jq; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      case "$OS" in
        macos) die "missing $cmd. Install via brew: brew install $cmd" ;;
        linux) die "missing $cmd. Install: sudo apt-get install -y $cmd  (or yum/dnf equivalent)" ;;
      esac
    fi
  done

  # Pick install path
  local DEFAULT_BRIDGE_DIR="$HOME/.notetaker-kanban"
  BRIDGE_DIR="$(ask "Bridge clone path" "$DEFAULT_BRIDGE_DIR")"
  BRIDGE_DIR="${BRIDGE_DIR/#\~/$HOME}"

  # Clone or update
  if [[ -d "$BRIDGE_DIR/.git" ]]; then
    ok "bridge repo present at $BRIDGE_DIR — pulling latest"
    git -C "$BRIDGE_DIR" pull --ff-only
  else
    mkdir -p "$BRIDGE_DIR"
    git clone https://github.com/chatwithllm/notetaker-kanban.git "$BRIDGE_DIR"
    ok "cloned to $BRIDGE_DIR"
  fi

  # Run bridge's install.sh
  info "running bridge installer (copies slash commands + hooks to ~/.claude/)"
  bash "$BRIDGE_DIR/install.sh"

  # Token + URL prompts
  local APP_URL_FROM_ENV="${APP_URL_FROM_ENV:-http://localhost:3001}"
  local KANBAN_URL KANBAN_TOKEN
  KANBAN_URL="$(ask "Kanban URL" "$APP_URL_FROM_ENV")"
  echo
  echo "  Generate an API token at $KANBAN_URL → Settings → API tokens"
  echo "  Paste it below (input is hidden):"
  read -s -r KANBAN_TOKEN </dev/tty
  echo
  [[ -n "$KANBAN_TOKEN" ]] || die "token cannot be empty"

  # Detect shell rc
  local RC_FILE
  RC_FILE="$(detect_shell_rc "$OS")"

  # Append exports if not already present
  {
    echo
    echo "# notetaker-kanban (added by SmartKanban installer)"
    echo "export KANBAN_URL=$KANBAN_URL"
    echo "export KANBAN_TOKEN=$KANBAN_TOKEN"
  } >> "$RC_FILE"

  chmod 600 "$RC_FILE" 2>/dev/null || warn "could not chmod 600 $RC_FILE — token is in a world-readable file"

  ok "appended KANBAN_URL + KANBAN_TOKEN to $RC_FILE"

  # Verify token
  info "testing token against $KANBAN_URL …"
  local code
  code="$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$KANBAN_URL/api/cards/00000000-0000-0000-0000-000000000000/activity" \
    -H "authorization: Bearer $KANBAN_TOKEN" \
    -H "content-type: application/json" \
    -d '{"type":"probe","body":"probe"}' 2>/dev/null || echo "000")"
  case "$code" in
    404) ok "token works (api-scope, server reachable)" ;;
    401) warn "token rejected (401) — token invalid" ;;
    403) warn "token wrong scope (403) — generate api-scope token, not mirror-scope" ;;
    000) warn "server unreachable at $KANBAN_URL" ;;
    *)   warn "unexpected probe response: HTTP $code" ;;
  esac

  step "Bridge installed"
  echo "  Next steps:"
  echo "    1. Open a new terminal (or: source $RC_FILE)"
  echo "    2. cd into any git repo"
  echo "    3. claude"
  echo "    4. /kanban-start"
  echo
  echo "  Bridge docs: https://github.com/chatwithllm/notetaker-kanban"
  echo
  echo "  Browse slash commands later with:"
  echo "    install.sh explain"
  echo
}

# ---------- do_install (server) ----------

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

# ---------- do_explain_commands ----------

do_explain_commands() {
  step "Slash command reference (notetaker-kanban bridge) [installer ${INSTALLER_VERSION}]"

  # Strategy: fetch WIKI.md (plain-english reference) from bridge repo and
  # render it via less (or cat). WIKI.md has: lifecycle primer, story
  # walkthrough, cheatsheet table, per-command reference, FAQ.
  #
  # Local bridge first, then github raw fallback.
  local wiki_path=""
  local cleanup_tmp=""

  # Try local bridge install
  if [[ -L "$HOME/.claude/notetaker-kanban" ]]; then
    local bridge_dir
    bridge_dir="$(readlink "$HOME/.claude/notetaker-kanban" 2>/dev/null || true)"
    if [[ -n "$bridge_dir" && -f "$bridge_dir/WIKI.md" ]]; then
      wiki_path="$bridge_dir/WIKI.md"
    fi
  fi

  # Fallback: fetch from github raw
  if [[ -z "$wiki_path" ]]; then
    info "Bridge not installed locally — fetching wiki from github…"
    EXPLAIN_CLEANUP_TMP="$(mktemp -t notetaker-wiki.XXXXXX)"
    cleanup_tmp="$EXPLAIN_CLEANUP_TMP"
    trap 'rm -f "${EXPLAIN_CLEANUP_TMP:-}"; unset EXPLAIN_CLEANUP_TMP' RETURN
    if curl -fsSL "https://raw.githubusercontent.com/chatwithllm/notetaker-kanban/main/WIKI.md" \
        -o "$cleanup_tmp" 2>/dev/null && [[ -s "$cleanup_tmp" ]]; then
      wiki_path="$cleanup_tmp"
    else
      warn "Could not fetch WIKI.md from github. Install the bridge locally:"
      info "  install.sh client"
      return 0
    fi
  fi

  # Render via less if available (search + page navigation), else cat.
  echo
  if [[ -n "$cleanup_tmp" ]]; then
    info "${C_YELLOW}Tip:${C_RESET} install the bridge with 'install.sh client' to actually run these commands."
    echo
  fi

  if [[ "$TTY_AVAILABLE" != "true" ]]; then
    cat "$wiki_path"
    return 0
  fi

  # Offer renderer install if absent
  if ! command -v glow >/dev/null 2>&1 && ! command -v mdcat >/dev/null 2>&1; then
    try_install_glow
  fi

  _explain_menu "$wiki_path"
}

# _explain_dump_full — render entire WIKI.md at once (legacy "dump" behavior)
_explain_dump_full() {
  local wiki_path="$1"
  if command -v glow >/dev/null 2>&1; then
    glow -p "$wiki_path" </dev/tty 2>/dev/null || cat "$wiki_path"
  elif command -v mdcat >/dev/null 2>&1; then
    mdcat --paginate "$wiki_path" </dev/tty 2>/dev/null || cat "$wiki_path"
  elif command -v less >/dev/null 2>&1; then
    less -R -F -X -K "$wiki_path" </dev/tty 2>/dev/null || cat "$wiki_path"
  else
    cat "$wiki_path"
  fi
}

# _explain_menu — split WIKI.md per-command (#### `/kanban-…`), show numbered
# list, user picks one, render it, return to list. Loop until quit.
_explain_menu() {
  local wiki_path="$1"
  # Globals so RETURN trap survives `set -u` after locals destroyed.
  WALKTHROUGH_TMPDIR="$(mktemp -d -t notetaker-walk.XXXXXX)"
  local tmpdir="$WALKTHROUGH_TMPDIR"
  trap 'rm -rf "${WALKTHROUGH_TMPDIR:-}"; unset WALKTHROUGH_TMPDIR' RETURN

  # Split per `#### ` heading; capture command name from heading text.
  # Sections end at the next top-level `## ` heading or horizontal rule
  # so trailing FAQ / "See also" content doesn't bleed into the last command.
  awk -v dir="$tmpdir" '
    /^#### / {
      n++
      file = sprintf("%s/cmd_%03d.md", dir, n)
      name = $0
      sub(/^#### +/, "", name)
      gsub(/`/, "", name)        # strip backticks
      gsub(/[<>]/, "", name)     # strip angle brackets in placeholders
      printf "%s\n", name > sprintf("%s/name_%03d.txt", dir, n)
      in_cmd = 1
      print > file
      next
    }
    /^## / || /^---[[:space:]]*$/ {
      in_cmd = 0
      next
    }
    /^### / {
      # H3 separates command groups; do not accumulate it into prior cmd
      in_cmd = 0
      next
    }
    in_cmd { print > file }
  ' "$wiki_path"

  local -a files=() names=()
  local f
  for f in "$tmpdir"/cmd_*.md; do
    [[ -f "$f" ]] && files+=("$f")
  done

  if (( ${#files[@]} == 0 )); then
    warn "Could not parse per-command sections — falling back to full dump."
    _explain_dump_full "$wiki_path"
    return 0
  fi

  local idx
  for f in "${files[@]}"; do
    idx="${f##*cmd_}"; idx="${idx%.md}"
    local name_file="$tmpdir/name_${idx}.txt"
    if [[ -f "$name_file" ]]; then
      names+=("$(<"$name_file")")
    else
      names+=("(unnamed)")
    fi
  done

  local total=${#files[@]}
  while true; do
    echo
    info "${C_BOLD}Slash command index${C_RESET} ($total commands)"
    echo
    local i
    for (( i=0; i<total; i++ )); do
      printf "    %2d) %s\n" "$((i+1))" "${names[$i]}"
    done
    echo
    info "    a) Show all (full WIKI.md dump)"
    info "    q) Quit"
    echo

    local ans
    read -r -p "  Pick a command [1-$total / a / q]: " ans </dev/tty
    case "$ans" in
      ""|q|Q) info "Exiting wiki."; return 0 ;;
      a|A)    _explain_dump_full "$wiki_path"; continue ;;
    esac

    if ! [[ "$ans" =~ ^[0-9]+$ ]] || (( ans < 1 || ans > total )); then
      warn "Invalid choice: $ans"
      continue
    fi

    local sel="${files[$((ans-1))]}"
    echo
    info "── ${names[$((ans-1))]} ──"
    echo
    if command -v glow >/dev/null 2>&1; then
      glow "$sel" </dev/tty 2>/dev/null || cat "$sel"
    elif command -v mdcat >/dev/null 2>&1; then
      mdcat "$sel" </dev/tty 2>/dev/null || cat "$sel"
    else
      cat "$sel"
    fi
    echo
    read -r -p "  [enter]=back to list, [q]=quit: " ans </dev/tty
    case "$ans" in
      q|Q) info "Exiting wiki."; return 0 ;;
    esac
  done
}

# try_install_glow — offer to install the markdown renderer for prettier wiki rendering.
# Best-available method per OS. User declines → silent fallthrough to less/cat.
try_install_glow() {
  local os
  case "$(uname -s)" in
    Darwin) os=macos ;;
    Linux)  os=linux ;;
    *)      return 0 ;;
  esac

  echo
  info "Optional: ${C_BOLD}glow${C_RESET} renders this wiki with bold, tables, and code highlighting."
  if ! ask_yn "Install glow now? (~5MB)" "y"; then
    info "Skipping — wiki will render as plain markdown source."
    echo
    return 0
  fi

  if [[ "$os" == "macos" ]]; then
    if command -v brew >/dev/null 2>&1; then
      info "Running: brew install glow"
      brew install glow </dev/tty || warn "brew install glow failed"
    else
      warn "Homebrew not found. Install glow manually: https://github.com/charmbracelet/glow"
    fi
    return 0
  fi

  # Linux paths in preference order
  if command -v apt-get >/dev/null 2>&1; then
    # Try Charm's official apt repo (cleaner than snap, no daemon)
    info "Adding Charm apt repo + installing glow…"
    {
      need_sudo mkdir -p /etc/apt/keyrings
      curl -fsSL https://repo.charm.sh/apt/gpg.key | need_sudo gpg --dearmor --yes -o /etc/apt/keyrings/charm.gpg
      echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
        | need_sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
      need_sudo apt-get update -qq
      need_sudo apt-get install -y glow
    } </dev/tty 2>&1 | tail -5

    if ! command -v glow >/dev/null 2>&1; then
      warn "Charm apt install failed — trying snap"
      if command -v snap >/dev/null 2>&1; then
        need_sudo snap install glow </dev/tty 2>&1 | tail -3
      fi
    fi
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    info "Adding Charm yum repo + installing glow…"
    {
      echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | need_sudo tee /etc/yum.repos.d/charm.repo >/dev/null
      need_sudo dnf install -y glow
    } </dev/tty 2>&1 | tail -5
    return 0
  fi

  if command -v snap >/dev/null 2>&1; then
    info "Installing via snap…"
    need_sudo snap install glow </dev/tty 2>&1 | tail -3
    return 0
  fi

  warn "No supported package manager. Install glow manually: https://github.com/charmbracelet/glow"
}


# ---------- interactive menu (both sides) ----------

interactive_menu() {
  local server_state="$1"
  local client_state="$2"

  echo
  info "${C_BOLD}Current state${C_RESET}"
  case "$server_state" in
    new|broken) info "  server : ${C_YELLOW}not installed${C_RESET}" ;;
    *)          info "  server : ${C_GREEN}installed${C_RESET} ($server_state)" ;;
  esac
  case "$client_state" in
    not-installed|broken) info "  client : ${C_YELLOW}not installed${C_RESET}" ;;
    *)                    info "  client : ${C_GREEN}installed${C_RESET} ($client_state)" ;;
  esac
  echo
  info "${C_BOLD}What would you like to do?${C_RESET}"

  # Build menu dynamically based on which sides are installed
  local -a options=()
  local -a labels=()

  # Install options surface when side absent
  if [[ "$server_state" == "new" || "$server_state" == "broken" ]]; then
    options+=("install_server")
    labels+=("Install server (kanban backend — Docker + Postgres)")
  else
    options+=("upgrade_server")
    labels+=("Upgrade server")
  fi

  if [[ "$client_state" == "not-installed" || "$client_state" == "broken" ]]; then
    options+=("install_client")
    labels+=("Install client (notetaker-kanban bridge — slash commands + hooks)")
  else
    options+=("upgrade_client")
    labels+=("Upgrade client (notetaker-kanban bridge)")
  fi

  if [[ "$server_state" != "new" && "$server_state" != "broken" ]]; then
    options+=("uninstall_server")
    labels+=("Uninstall server")
  fi

  if [[ "$client_state" != "not-installed" && "$client_state" != "broken" ]]; then
    options+=("uninstall_client")
    labels+=("Uninstall client (notetaker-kanban bridge)")
  fi

  # Wiki always shown — falls back to github raw when bridge not installed locally
  options+=("explain_commands")
  labels+=("Explore slash commands (wiki — guided walkthrough)")

  options+=("status")
  labels+=("Status (verbose)")

  options+=("bridge_docs")
  labels+=("Re-print developer onboarding (notetaker bridge)")

  options+=("quit")
  labels+=("Quit")

  local i=1
  for label in "${labels[@]}"; do
    info "  $i) $label"
    (( i++ ))
  done

  local choice
  choice="$(ask "Choice" "1")"

  # Validate numeric choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#options[@]} )); then
    warn "Unknown choice '$choice' — exiting."
    exit 1
  fi

  local action="${options[$(( choice - 1 ))]}"

  case "$action" in
    install_server)   do_install ;;
    install_client)   do_install_client ;;
    upgrade_server)   do_upgrade ;;
    upgrade_client)   do_upgrade_client ;;
    uninstall_server) do_uninstall ;;
    uninstall_client) do_uninstall_client ;;
    explain_commands) do_explain_commands ;;
    status)           do_status ;;
    bridge_docs)      do_print_bridge_docs ;;
    quit)             info "Quit."; exit 0 ;;
  esac
}

# ---------- prompt_side_choice ----------
# Called when neither side is installed and the user didn't specify.
prompt_side_choice() {
  if [[ "$TTY_AVAILABLE" != "true" ]]; then
    # Non-interactive default: server (back-compat with curl|bash)
    echo "server"
    return
  fi

  echo
  echo "  What are you installing?"
  echo "    1) Server  — kanban backend (Docker + Postgres on a host machine)"
  echo "    2) Client  — notetaker-kanban bridge (slash commands + hooks on YOUR laptop)"
  local choice
  read -r -p "  Choice [1]: " choice </dev/tty
  choice="${choice:-1}"

  case "$choice" in
    1) echo "server" ;;
    2) echo "client" ;;
    *) die "Invalid choice: $choice" ;;
  esac
}

# ---------- main ----------

main() {
  # Parse arguments: optional side (server|client) followed by optional action
  local SIDE=""
  local ACTION="auto"

  case "${1:-}" in
    server|client)
      SIDE="$1"
      ACTION="${2:-auto}"
      ;;
    install|upgrade|uninstall|status|explain|auto)
      ACTION="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    "")
      ACTION="auto"
      ;;
    *)
      die "unknown argument: ${1}. Run with --help for usage."
      ;;
  esac

  # Validate second arg if SIDE was set
  case "$ACTION" in
    install|upgrade|uninstall|status|explain|auto) ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown action: $ACTION. Run with --help for usage." ;;
  esac

  # --- Dispatch when SIDE is explicitly given ---

  if [[ "$SIDE" == "server" ]]; then
    case "$ACTION" in
      install|auto) do_install ;;
      upgrade)      do_upgrade ;;
      uninstall)    do_uninstall ;;
      status)       do_status ;;
      explain)      do_explain_commands ;;
    esac
    return
  fi

  if [[ "$SIDE" == "client" ]]; then
    case "$ACTION" in
      install|auto) do_install_client ;;
      upgrade)      do_upgrade_client ;;
      uninstall)    do_uninstall_client ;;
      status)       do_status ;;
      explain)      do_explain_commands ;;
    esac
    return
  fi

  # --- No explicit SIDE — auto-detect ---

  if [[ "$ACTION" == "status" ]]; then
    do_status
    return
  fi

  if [[ "$ACTION" == "explain" ]]; then
    do_explain_commands
    return
  fi

  resolve_install_dir
  resolve_bridge_dir

  local server_state client_state
  server_state="$(detect_server_state "$INSTALL_DIR")"
  client_state="$(detect_client_state)"

  local server_present=false client_present=false
  [[ "$server_state" != "new" && "$server_state" != "broken" ]] && server_present=true
  [[ "$client_state" != "not-installed" && "$client_state" != "broken" ]] && client_present=true

  # Warn if both are present on the same host
  if $server_present && $client_present; then
    warn "Both server and client are installed on this host."
  fi

  if [[ "$ACTION" == "auto" ]]; then
    # Always go through interactive_menu — works whether nothing,
    # one side, or both sides are installed. Menu surfaces install/
    # upgrade/uninstall/wiki/status options based on detected state.
    if ! $server_present && ! $client_present; then
      step "SmartKanban installer — nothing detected on this host"
      info "You can install one or both sides, or just explore the wiki."
      interactive_menu "$server_state" "$client_state"
      return
    fi

    # At least one side detected — show appropriate status summary then menu
    if $server_present; then
      case "$server_state" in
        up-to-date) ok "Server at $INSTALL_DIR is up to date." ;;
        behind)     warn "Server at $INSTALL_DIR is behind origin/main — upgrade recommended." ;;
        ahead)      warn "Server at $INSTALL_DIR is ahead of origin/main (local commits present)." ;;
        diverged)   warn "Server at $INSTALL_DIR has diverged from origin/main." ;;
      esac
    fi
    if $client_present; then
      case "$client_state" in
        up-to-date) ok "Client bridge is up to date." ;;
        behind)     warn "Client bridge is behind origin/main — upgrade recommended." ;;
      esac
    fi
    # Handle broken states
    if [[ "$server_state" == "broken" ]]; then
      warn "Server directory $INSTALL_DIR exists but is not a valid SmartKanban git repo."
    fi
    if [[ "$client_state" == "broken" ]]; then
      warn "Client bridge symlink/repo is broken."
    fi

    interactive_menu "$server_state" "$client_state"
    return
  fi

  # Non-auto explicit action with no side — apply to whichever side is present,
  # or default to server for back-compat.
  case "$ACTION" in
    install)
      if $client_present && ! $server_present; then
        do_install_client
      else
        do_install
      fi
      ;;
    upgrade)
      if $server_present; then do_upgrade; fi
      if $client_present; then do_upgrade_client; fi
      if ! $server_present && ! $client_present; then
        die "Nothing installed to upgrade. Run without arguments to start an install."
      fi
      ;;
    uninstall)
      if $server_present; then do_uninstall; fi
      if $client_present; then do_uninstall_client; fi
      if ! $server_present && ! $client_present; then
        warn "Nothing installed to uninstall."
      fi
      ;;
    explain)
      do_explain_commands
      ;;
  esac
}

main "$@"
