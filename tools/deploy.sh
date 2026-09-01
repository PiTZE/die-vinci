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
    # Only through tools/release.sh, which is the thing that knows what the
    # next version is. A stable deploy made by hand is how the channel ended
    # up serving a number nothing in the repo agreed with.
    if [ "${RELEASING:-}" != 1 ]; then
      echo "deploy: stable is released by tools/release.sh, not by hand" >&2
      exit 1
    fi
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
