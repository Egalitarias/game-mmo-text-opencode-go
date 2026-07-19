# Deployment

Production deployment for `swordandboard.xyz`, following the topology in
`ARCHITECTURE.md` §12: Caddy terminates TLS and serves the client build;
systemd runs the Node game server on `127.0.0.1:3000`.

Assumes a Debian/Ubuntu server, a `deploy` user with sudo, the repo cloned to
`~/game-mmo-text-opencode-go`, and a DNS A record for `swordandboard.xyz`
pointing at the server.

---

## 1. One-time server setup

Node 22 + pnpm (system-wide, so systemd can find it):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable          # pnpm, version pinned by package.json
```

> Node via nvm also works, but then the systemd unit below needs the absolute
> path to that node binary — system-wide is simpler.

Caddy (automatic Let's Encrypt certificates):

```bash
sudo apt install -y caddy
```

Firewall — only web ports open:

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

## 2. Build the app

```bash
cd ~/game-mmo-text-opencode-go
git pull
pnpm install --frozen-lockfile
pnpm build      # typechecks everything + produces packages/client/dist
```

If install fails with `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds esbuild`
once (the approval is committed in `pnpm-workspace.yaml`, so it normally just works).

## 3. systemd unit for the game server

```bash
sudo tee /etc/systemd/system/game-server.service > /dev/null <<'EOF'
[Unit]
Description=Text MMO game server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/game-mmo-text-opencode-go/packages/server
ExecStart=/home/deploy/game-mmo-text-opencode-go/packages/server/node_modules/.bin/tsx src/index.ts
Restart=always
RestartSec=2
Environment=NODE_ENV=production HOST=127.0.0.1 PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now game-server
```

Running via `tsx` is deliberate for v1 — the server imports `@game/shared` as
TypeScript source, which plain Node won't load.

## 4. Caddy config

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
swordandboard.xyz

@ws path /ws
reverse_proxy @ws 127.0.0.1:3000

root * /home/deploy/game-mmo-text-opencode-go/packages/client/dist
encode zstd gzip
file_server
EOF

sudo systemctl reload caddy
```

Caddy runs as `www-data` and must be able to read the client build inside the
deploy home directory:

```bash
chmod o+x ~ ~/game-mmo-text-opencode-go{,/packages,/packages/client}
chmod -R o+rX ~/game-mmo-text-opencode-go/packages/client/dist
```

The client derives its WebSocket URL from the page origin, so it automatically
uses `wss://swordandboard.xyz/ws` — no client config needed. The first HTTPS
request triggers certificate issuance; allow ~30s after DNS is live.

## 5. Verify

```bash
systemctl status game-server                 # active (running)
journalctl -u game-server -f                 # "game server listening on ws://127.0.0.1:3000/ws"
curl -sI https://swordandboard.xyz | head -1 # HTTP/2 200
```

WebSocket upgrade end-to-end (expect `101`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  https://swordandboard.xyz/ws
```

Then open `https://swordandboard.xyz` in two tabs — pick handles, move with
arrows or vi-keys, press `Enter` to chat.

## 6. Redeploy flow

```bash
cd ~/game-mmo-text-opencode-go
git pull
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart game-server   # brief downtime; clients auto-reconnect
```

**Known caveat:** restarting drops the in-memory world and all connections.
Clients reconnect automatically and re-pick their handle — acceptable for v1.
Persistent worlds arrive via the `WorldStore` seam (see `ARCHITECTURE.md` §7).
