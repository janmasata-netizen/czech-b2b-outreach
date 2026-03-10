#!/usr/bin/env bash
# Deploy outreach-ui via Docker on VPS
# Usage: ./deploy-docker.sh
set -euo pipefail

VPS_IP="${VPS_IP:-72.62.53.244}"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/vps_deploy_key"
REMOTE_DIR="/docker/outreach-ui"

echo "=== Building Docker image locally ==="
docker build -t outreach-ui:latest .

echo "=== Saving image ==="
docker save outreach-ui:latest | gzip > /tmp/outreach-ui.tar.gz

echo "=== Uploading to VPS ==="
scp -i "$SSH_KEY" /tmp/outreach-ui.tar.gz "$VPS_USER@$VPS_IP:/tmp/"
scp -i "$SSH_KEY" docker-compose.prod.yml "$VPS_USER@$VPS_IP:$REMOTE_DIR/docker-compose.prod.yml"

echo "=== Loading image and restarting on VPS ==="
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_IP" bash -s <<'REMOTE'
cd /docker/outreach-ui
docker load < /tmp/outreach-ui.tar.gz
docker compose -f docker-compose.prod.yml up -d --force-recreate
rm -f /tmp/outreach-ui.tar.gz
echo "Done! UI at http://$(hostname -I | awk '{print $1}'):32772"
REMOTE

rm -f /tmp/outreach-ui.tar.gz
echo "=== Deploy complete ==="
