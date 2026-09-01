#!/usr/bin/env bash
# Releases the next stable version. The only supported way to touch stable.
#
#   tools/release.sh            what it would do, and nothing else
#   tools/release.sh --go       do it
#
# The number comes from what stable is actually serving, not from
# package.json. That is the whole point of this script existing.
#
# It went wrong once and it went wrong in exactly that way: package.json on dev
# had drifted to 0.3.2 through bumps that were never released, stable was on
# 0.3.2 from a deploy that never touched the branch, and a bump taken off the
# working tree with the wrong level produced 0.4.0. Two channels, two
# different ideas of the version, and a hand-typed level in between them.
#
# So: one step past live stable, worked out here, checked here, and nothing to
# choose. Every guard below refuses rather than asks.

set -euo pipefail

cd "$(dirname "$0")/.."

GO=0
[ "${1:-}" = "--go" ] && GO=1

say() { printf '%s\n' "$*"; }
die() { printf 'release: %s\n' "$*" >&2; exit 1; }

# -- where we are ----------------------------------------------------------

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = dev ] || die "on $BRANCH; releases are cut from dev"

[ -z "$(git status --porcelain)" ] || die 'working tree is dirty; commit or stash first'

git fetch -q origin
[ "$(git rev-parse dev)" = "$(git rev-parse origin/dev)" ] ||
  die 'dev and origin/dev differ; push or pull first'

# -- what stable is serving -------------------------------------------------
#
# The live channel, not the checkout. A deploy can be made from any tree, so
# the file on the server is the only thing that knows what was released.

LIVE=$(curl -fsS "https://leo.generis.ir/version.json?cachebust=$$" |
  sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
[ -n "$LIVE" ] || die 'could not read the live stable version'
case "$LIVE" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "live stable reports \"$LIVE\", which is not a version" ;;
esac

# -- one step past it -------------------------------------------------------
#
# The same carry the bump script uses: every segment holds one digit, so 0.3.9
# is followed by 0.4.0 and 0.9.9 by 1.0.0. One step, always. There is no level
# to pass in, because passing one in is how this went wrong.

NEXT=$(node -e '
  const [a, b, c] = process.argv[1].split(".").map(Number)
  let [x, y, z] = [a, b, c + 1]
  if (z > 9) { z = 0; y += 1 }
  if (y > 9) { y = 0; x += 1 }
  process.stdout.write(`${x}.${y}.${z}`)
' "$LIVE")

TAG="v$NEXT"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "$TAG already exists; stable says $LIVE, so something released without this script"
fi

say "live stable   $LIVE"
say "releasing     $NEXT   ($TAG)"
say "from          $(git log --oneline -1)"

if [ "$GO" -ne 1 ]; then
  say
  say 'dry run. tools/release.sh --go to do it.'
  exit 0
fi

# -- the gate ---------------------------------------------------------------
#
# On the suite's own exit code. Piping it through grep once shipped a red
# build, because grep exits zero when it finds something.

say
say 'running the suite'
npm test -- 1

# -- cut it ----------------------------------------------------------------

node -e '
  const fs = require("fs")
  const p = "package.json"
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"))
  pkg.version = process.argv[1]
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n")
' "$NEXT"

git add package.json
git commit -q -m "$NEXT"
git tag -a "$TAG" -m "$NEXT"

RELEASING=1 bash tools/deploy.sh stable

# The server is the source of truth on the way out as well as in.
SERVED=$(curl -fsS "https://leo.generis.ir/version.json?cachebust=$$" |
  sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
[ "$SERVED" = "$NEXT" ] || die "deployed, but stable reports \"$SERVED\" rather than $NEXT"

# dev carries the release commit, and main is where releases live.
git push -q origin dev
git push -q origin "$TAG"
git branch -qf main dev
git push -q origin main

say
say "released $NEXT, and stable is serving it"
