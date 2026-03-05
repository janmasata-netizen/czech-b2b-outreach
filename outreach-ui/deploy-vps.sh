#!/bin/bash
# Deploy outreach-ui dist to VPS
# Usage: VPS_PASS=yourpassword bash deploy-vps.sh
# Or:    bash deploy-vps.sh  (prompts for password)

VPS_IP="72.62.53.244"
VPS_USER="root"
DIST_DIR="$(dirname "$0")/dist"

if [ -z "$VPS_PASS" ]; then
  echo -n "VPS root password: "
  read -s VPS_PASS
  echo
fi

# Build first
cd "$(dirname "$0")"
npm run build

# Copy dist to VPS using sshpass
if command -v sshpass &> /dev/null; then
  sshpass -p "$VPS_PASS" scp -o StrictHostKeyChecking=no -r "$DIST_DIR"/* "$VPS_USER@$VPS_IP:/docker/outreach-ui/dist/"
  echo "✓ Files copied (nginx reads directly from bind mount, no restart needed)"
  echo "✓ Deployed to $VPS_IP:32772"
else
  echo "sshpass not found. Manual steps:"
  echo "  scp -r dist/* root@$VPS_IP:/opt/outreach-ui/dist/"
  echo "  ssh root@$VPS_IP 'docker restart outreach-ui-outreach-ui-1'"
fi
