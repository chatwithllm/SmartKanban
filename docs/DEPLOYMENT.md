# Deployment Guide

Step-by-step instructions for deploying SmartKanban to a production server.
Targets a single small VPS (1 CPU / 1 GB RAM is enough for a family of 5).

This guide assumes:

- A Linux VPS you control (Debian 12 / Ubuntu 22.04+ tested)
- A domain or subdomain pointing at the VPS (e.g. `kanban.example.com`)
- Sudo access (the installer will prompt for your sudo password)
- Familiarity with the terminal

The reference stack is **Docker Compose** (Postgres + the app) behind
**Caddy** (auto-HTTPS via Let's Encrypt). Nginx + certbot is also documented
at the end.

---

## Quick install (one-click)

If you just want it running, run this on a fresh Debian/Ubuntu VPS as a
sudo-capable user:

```bash
curl -fsSL https://raw.githubusercontent.com/chatwithllm/SmartKanban/main/scripts/install.sh | bash
```

The script handles everything: installs Docker, clones the repo,
generates secrets, prompts for your domain + Telegram + AI keys,
brings up the database, applies the schema, builds + starts the
server, optionally configures Caddy for HTTPS, and sets up daily
backups. It is **idempotent** — safe to re-run.

After it finishes, open the URL it prints and register the first
user.

If you'd rather run the steps by hand, follow the manual walkthrough
below.

---

## Manual walkthrough

## Step 1 — Prepare the VPS

SSH into the box as a sudo user:

```bash
ssh deploy@kanban.example.com
```

Install Docker + Docker Compose plugin:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release git ufw

# Docker official install
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (log out + in after)
sudo usermod -aG docker $USER
```

Open the firewall — only ports 80 and 443 are exposed publicly. The app
itself listens on 3001 internally.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Verify:

```bash
docker version
docker compose version
```

---

## Step 2 — Clone the repository

`/opt` is root-owned by default — you must either use sudo to bootstrap
it OR clone into your home directory. The installer chooses your home
directory automatically; for the manual path, pick one:

**Option A — into `/opt/smartkanban` (system-wide convention):**

```bash
sudo mkdir -p /opt/smartkanban
sudo chown "$USER:$USER" /opt/smartkanban
git clone https://github.com/chatwithllm/SmartKanban.git /opt/smartkanban
cd /opt/smartkanban
```

**Option B — into your home directory (no sudo for clone):**

```bash
git clone https://github.com/chatwithllm/SmartKanban.git ~/smartkanban
cd ~/smartkanban
```

Both paths work identically. Examples below use `/opt/smartkanban`;
substitute your path if you picked B.

---

## Step 3 — Configure environment variables

```bash
cp .env.example server/.env
nano server/.env   # or vim, etc.
```

Minimum required:

```
COOKIE_SECRET=<paste a long random string — `openssl rand -hex 32`>
DATABASE_URL=postgres://kanban:kanban@db:5432/kanban
PORT=3001
APP_URL=https://kanban.example.com
```

If you use the Telegram bot:

```
TELEGRAM_BOT_TOKEN=123456:ABCDEF…       # from @BotFather
TELEGRAM_GROUP_ID=-100XXXXXXXXXX        # the family group id
TELEGRAM_WEBHOOK_URL=https://kanban.example.com/telegram/webhook/<secret>
TELEGRAM_WEBHOOK_SECRET=<paste another random hex>
```

If you want AI features (proposal flow, vision summaries, weekly review):

```
OPENROUTER_API_KEY=sk-or-v1-…
OPENROUTER_MODEL=google/gemini-2.0-flash-001
```

If you want voice transcription or AI fallback:

```
OPENAI_API_KEY=sk-…
```

To lock signups after your family is registered:

```
OPEN_SIGNUP=false
```

Save and exit.

---

## Step 4 — Bring up the database

```bash
docker compose up -d db
```

Wait ~5 seconds, then initialize the schema (idempotent — safe to re-run):

```bash
docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban < server/schema.sql
```

You should see a series of `CREATE TABLE` / `CREATE INDEX` lines and no
errors.

---

## Step 5 — Build and start the application

```bash
docker compose up -d --build server
docker compose logs -f server
```

Watch for `server listening on 3001` and no Postgres connection errors.
Hit `Ctrl-C` to stop tailing logs (the container keeps running).

Smoke test from the VPS:

```bash
curl -s http://localhost:3001/health
# → {"ok":true}
```

The app is now running on the VPS but not yet reachable from the
internet. Step 6 wires up TLS.

---

## Step 6 — Reverse proxy + HTTPS (Caddy, recommended)

Install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Replace `/etc/caddy/Caddyfile` with:

```
kanban.example.com {
    encode zstd gzip
    reverse_proxy localhost:3001 {
        # WebSocket upgrade is handled automatically by Caddy
    }
}
```

Reload and verify:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy will fetch a Let's Encrypt cert on first request. Visit
`https://kanban.example.com` in a browser — you should land on the login
screen.

---

## Step 7 — Register the first user

In a browser at `https://kanban.example.com`:

1. Click "Register"
2. Enter your name, short name (e.g. "Alex"), email, password
3. Submit → you're logged in. The first registered user becomes the
   board owner.

If the registration form rejects you, double-check `OPEN_SIGNUP` is
unset or `true` in `server/.env`. Set `OPEN_SIGNUP=false` once your
whole family is registered:

```bash
sudo nano server/.env
docker compose restart server
```

---

## Step 8 — Set up the Telegram bot (optional but recommended)

1. **Create the bot.** DM [@BotFather](https://t.me/BotFather) on
   Telegram, run `/newbot`, follow prompts. Copy the token into
   `TELEGRAM_BOT_TOKEN` in `server/.env`.
2. **Disable group privacy mode** so the bot sees all group messages.
   In BotFather: `/mybots` → your bot → Bot Settings → Group Privacy →
   Turn OFF.
3. **Find your family group's chat id.** Add the bot to your family
   Telegram group. DM
   [@RawDataBot](https://t.me/RawDataBot) once from the group, copy
   the `chat.id` value (negative number starting with `-100…`) into
   `TELEGRAM_GROUP_ID`.
4. **Configure webhook (production).** Set
   `TELEGRAM_WEBHOOK_URL=https://kanban.example.com/telegram/webhook/<secret>`
   and a matching `TELEGRAM_WEBHOOK_SECRET` in `server/.env`. Restart:

   ```bash
   docker compose restart server
   ```

   The server registers the webhook with Telegram on startup. (For
   local dev, leave `TELEGRAM_WEBHOOK_URL` unset and the bot will
   long-poll instead.)
5. **Link your Telegram identity to your app account.** DM
   [@userinfobot](https://t.me/userinfobot) → it tells you your
   Telegram user id. In the web app: **Settings → Telegram identities
   → paste id → Link to me.** Repeat for each family member.
6. **Test it.** Send any message in the family group — a card should
   appear in Family Inbox within a second. DM the bot directly for
   private cards.

---

## Step 9 — Backups

Set up daily pg_dump + attachment archive:

```bash
# Create backup target
sudo mkdir -p /var/backups/smartkanban
sudo chown $USER:$USER /var/backups/smartkanban

# Test the backup script once
/opt/smartkanban/scripts/backup.sh /var/backups/smartkanban
ls -lh /var/backups/smartkanban/
```

You should see a `db-<ts>.sql.gz` and an `attachments-<ts>.tar.gz`.

Add a cron job:

```bash
crontab -e
```

Append:

```
0 3 * * *  /opt/smartkanban/scripts/backup.sh /var/backups/smartkanban
```

The script keeps the last 14 daily backups. For off-site backup, mount
or sync `/var/backups/smartkanban/` to your preferred destination
(rsync to NAS, rclone to Backblaze, etc.).

---

## Step 10 — (Optional) Enable semantic knowledge search

Requires the pgvector extension and an OpenAI key.

```bash
docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
echo "KNOWLEDGE_EMBEDDINGS=true" >> server/.env
echo "OPENAI_API_KEY=sk-…"       >> server/.env
docker compose restart server
```

The embed queue picks up existing knowledge items on the next
write/refetch and on startup. Verify:

```bash
docker compose logs server | grep -i embed
```

---

## Updating to a new release

```bash
cd /opt/smartkanban
git pull
docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban < server/schema.sql
docker compose up -d --build server
docker compose logs -f server
```

The schema is idempotent — re-running on prod is safe. New columns,
indexes, and tables are additive.

To roll back, check out the previous commit and redeploy:

```bash
git log --oneline | head -10
git checkout <previous-sha>
docker compose up -d --build server
```

(Schema migrations are forward-compatible — older code can run against
a newer schema without crashing, since columns are nullable + defaulted.)

---

## Troubleshooting

### Server container restart loops

```bash
docker compose logs --tail=200 server
```

Common causes:

- `COOKIE_SECRET` missing → app refuses to start. Set it.
- `DATABASE_URL` wrong → connection refused. Confirm `db` is up:
  `docker compose ps db`.
- Schema not initialized → run Step 4 again.

### Telegram bot silent

- `TELEGRAM_BOT_TOKEN` wrong or revoked → check BotFather.
- Group privacy mode still on → bot only sees commands, not free text.
  Re-toggle in BotFather.
- Wrong `TELEGRAM_GROUP_ID` → the bot silently ignores other groups.
  Verify with @RawDataBot.
- Webhook URL not reachable → confirm `https://your-domain/health`
  works from the public internet, then re-check `TELEGRAM_WEBHOOK_URL`.

### "Doesn't look like a task" hint everywhere

The proposal flow ran but the LLM thinks the message isn't a task.
Either tap the column button anyway or rephrase. To bypass entirely
for a message, send `/today <text>`.

### Web app loads but cards don't appear

Open the browser console. WebSocket errors usually mean the reverse
proxy isn't forwarding the upgrade. With Caddy this works out of the
box; with nginx see "Alternative: Nginx" below.

### Restoring from a backup

```bash
docker compose down
docker volume rm kanbanclaude_kanban_pgdata   # destroys current DB
docker compose up -d db
gunzip -c /var/backups/smartkanban/db-<ts>.sql.gz \
  | docker exec -i kanbanclaude-db-1 psql -U kanban -d kanban
tar -xzf /var/backups/smartkanban/attachments-<ts>.tar.gz \
  -C /opt/smartkanban/server/data/
docker compose up -d server
```

---

## Alternative: Nginx + certbot

If you prefer nginx:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/smartkanban`:

```
server {
    listen 80;
    server_name kanban.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Enable and obtain certificate:

```bash
sudo ln -s /etc/nginx/sites-available/smartkanban /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kanban.example.com
```

---

## Hardening checklist (after first deploy)

- [ ] Set `OPEN_SIGNUP=false` once family is registered
- [ ] Rotate `COOKIE_SECRET` if it ever leaked (logs out everyone)
- [ ] Confirm UFW allows only 22/80/443
- [ ] `fail2ban` for SSH (`sudo apt install fail2ban`)
- [ ] Daily backup cron is running (`grep CRON /var/log/syslog`)
- [ ] Off-site copy of backups configured
- [ ] HTTPS-only — no plain :3001 exposed publicly
- [ ] BotFather: bot has a username + description, group privacy off
- [ ] Telegram webhook secret is unguessable

---

## What "production" means here

This guide assumes a small trusted user base (a family). It does **not**
defend against:

- Malicious users in your own family group (the model assumes everyone
  is trusted)
- DDoS or rate-limited abuse (no global rate limiter ships with the
  app)
- Multi-tenant isolation (one Postgres database, one bot, one group)

For a public-facing or multi-tenant deployment, you'd want a rate
limiter, audit logs, role-based admin, SSO, and a non-trivial scale-out
plan — none of which are goals of this project.

---

## Getting help

- Open an issue at https://github.com/chatwithllm/SmartKanban/issues
- Check `docker compose logs --tail=200 server` for the most useful
  error context
