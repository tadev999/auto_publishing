#!/usr/bin/env bash
# One-time setup for Ubuntu 22.04 / 24.04. Run from the repo root as a sudo-capable user:
#   bash deploy/setup_vps.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> System packages"
sudo apt-get update -y
# Ubuntu 24.04 renamed libasound2 → libasound2t64.
ASOUND=libasound2
apt-cache show libasound2t64 >/dev/null 2>&1 && ASOUND=libasound2t64
sudo apt-get install -y software-properties-common curl ffmpeg git "$ASOUND" \
  libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libxrandr2 libxkbcommon-dev \
  libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2

if ! command -v python3.12 >/dev/null; then
  sudo add-apt-repository -y ppa:deadsnakes/ppa
  sudo apt-get update -y
  sudo apt-get install -y python3.12 python3.12-venv
fi

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Timezone (schedule and cron run on Vietnam time)"
sudo timedatectl set-timezone Asia/Ho_Chi_Minh

echo "==> Python environment"
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .

echo "==> Remotion"
(cd remotion && npm ci && npx remotion browser ensure)

echo "==> Secrets"
if [ ! -f .env ]; then
  cp .env.example .env
fi
chmod 600 .env
mkdir -p data/logs assets/music/{calm,reflective,warm}

echo "==> Cron file"
sed "s#__APP_DIR__#${APP_DIR}#g" deploy/crontab > deploy/crontab.local

cat <<MSG

Setup complete.
Next steps:
  1. nano .env                         # fill in API keys
  2. .venv/bin/endo doctor             # everything should be green
  3. .venv/bin/endo ingest             # one-time: build the idea bank
  4. .venv/bin/endo tiktok-auth        # connect TikTok
  5. crontab deploy/crontab.local      # start the automatic schedule
MSG
