#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for Tummy (healthspec.md §3).
# Run as root, once, after adding your SSH key for root:
#
#   ssh root@<vps> 'bash -s' < deploy/bootstrap.sh
#
# Afterwards: log in as `deploy`, never as root.
set -euo pipefail

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "No SSH key in /root/.ssh/authorized_keys. Add yours first, or this locks you out." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl ufw cron unattended-upgrades

# Security updates install themselves.
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker, from Docker's own repository.
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# A user to deploy as, with the same key as root.
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys

# Keys only. A drop-in rather than an edit to sshd_config: Ubuntu's cloud
# images ship 50-cloud-init.conf turning passwords back on, and sshd takes the
# first value it reads, so this sorts ahead of it.
cat > /etc/ssh/sshd_config.d/00-tummy.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
sshd -t
systemctl reload ssh

# Only SSH and the web in. The app's own port is bound to 127.0.0.1 by
# compose.yaml, since Docker's published ports bypass ufw.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# 2 GB of swap: headroom for a 1 GB box.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Where the app lives. Photos belong to uid 1000, the image's `node` user,
# whatever that uid is called on the host (Vultr's images call it linuxuser).
install -d -o deploy -g deploy /srv/tummy /srv/tummy/backups
install -d -o 1000 -g 1000 /srv/tummy/photos

echo
echo "Done. Next, as deploy@<vps>: put .env in /srv/tummy (see deploy/README.md)."
