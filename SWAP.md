# Swap

`pnpm install` and `pnpm build` spike memory past what a small VPS (512MB–1GB
RAM) has. The symptom is the Linux OOM killer terminating pnpm mid-install with
a bare `Killed` message. A 2GB swapfile is the fix.

The running stack (Caddy + one Node game server) only uses ~100–200MB, so swap
is touched during builds and deploys — it costs nothing at runtime.

Assumes a Debian/Ubuntu server with sudo.

---

## 1. Confirm the OOM kill

```bash
free -h                                        # check total RAM
sudo dmesg -T | grep -iE "oom|killed process"  # should show node/pnpm being killed
```

## 2. Create the swapfile

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

> If `fallocate` fails (some filesystems don't support it), use
> `sudo dd if=/dev/zero of=/swapfile bs=1M count=2048` instead.

## 3. Persist across reboots

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Verify

```bash
free -h        # Swap row shows 2.0Gi total
swapon --show
```

Then re-run the deploy steps (`DEPLOY.md` §2):

```bash
pnpm install --frozen-lockfile
pnpm build
```

## 5. Optional: prefer RAM

Default `vm.swappiness=60` is fine, but 10 makes the kernel strongly prefer RAM
— sensible for a game server that only needs swap for builds:

```bash
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl vm.swappiness=10
```

## Removing it

```bash
sudo swapoff /swapfile
sudo rm /swapfile
# and delete the /swapfile line from /etc/fstab
```
