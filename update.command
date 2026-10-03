#!/bin/sh
# Double-click this file on a Mac (or run "sh update.command" on Linux).
cd "$(dirname "$0")" || exit 1

finish() {
  echo
  printf '  Press Return to close this window. '
  read -r _
  exit "$1"
}

failed() {
  echo
  echo "  Something went wrong. The messages above say what; DEPLOY.md has a"
  echo "  troubleshooting section."
  finish 1
}

echo
echo "  Checking that Docker Desktop is running..."
if ! docker info >/dev/null 2>&1; then
  echo
  echo "  Docker Desktop isn't running. Open Docker Desktop, wait until it says"
  echo "  \"Engine running\", then double-click update.command again."
  finish 1
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.tunnel.yml"

echo "  Preparing the setup tools (the first time takes a few minutes)..."
$COMPOSE build setup || failed
$COMPOSE run --rm setup scripts/setup.js --refresh || failed

echo
echo "  Starting the skill..."
$COMPOSE up -d --build --remove-orphans || failed

$COMPOSE run --rm setup scripts/alexa-skill.js || failed

echo
echo "  All done. You can close this window."
finish 0
