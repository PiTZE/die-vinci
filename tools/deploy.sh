#!/usr/bin/env bash
# Publishes a channel to /var/www/leonard.
#
#   tools/deploy.sh stable
#   tools/deploy.sh dev
#
# Stable lives at the root and dev in the dev/ subdirectory, so the stable
# rsync has to exclude dev/ or --delete would take the whole dev channel with
# it. That is the one dangerous line here.
#
# tarot/ is excluded for the same reason. It is a temporary comparison sheet,
# not part of either channel, and a stable deploy would otherwise delete it out
# from under whoever is looking at it. Delete the directory by hand when done.
set -euo pipefail

CHANNEL="${1:-}"
ROOT=/var/www/leonard

case "$CHANNEL" in
  stable)
    npm run build
    rsync -a --delete --exclude='dev/' --exclude='tarot/' dist/ "$ROOT/"
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
