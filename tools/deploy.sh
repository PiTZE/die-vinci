#!/usr/bin/env bash
# Publishes a channel to /var/www/leonard.
#
#   tools/deploy.sh stable
#   tools/deploy.sh dev
#
# Stable lives at the root and dev in the dev/ subdirectory, so the stable
# rsync has to exclude dev/ or --delete would take the whole dev channel with
# it. That is the one dangerous line here.

set -euo pipefail

CHANNEL="${1:-}"
ROOT=/var/www/leonard

case "$CHANNEL" in
  stable)
    npm run build
    rsync -a --delete --exclude='dev/' dist/ "$ROOT/"
    ;;
  dev)
    CHANNEL=dev npm run build
    mkdir -p "$ROOT/dev"
    rsync -a --delete dist-dev/ "$ROOT/dev/"
    ;;
  *)
    echo "usage: tools/deploy.sh {stable|dev}" >&2
    exit 1
    ;;
esac

curl -s "https://leo.generis.ir/$( [ "$CHANNEL" = dev ] && echo dev/ )version.json"
echo
