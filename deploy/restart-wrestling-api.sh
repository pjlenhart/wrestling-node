#!/bin/bash
#
# Restarts the API under forever. Install on the VPS as root:
#
#   sudo install -o root -g root -m 0755 \
#       deploy/restart-wrestling-api.sh /usr/local/sbin/restart-wrestling-api
#
# and grant the deploy user NOPASSWD sudo on that path alone:
#
#   pj ALL=(root) NOPASSWD: /usr/local/sbin/restart-wrestling-api
#
# The wrapper exists so the sudo grant carries no argument surface. Granting
# sudo on `forever` directly would let any caller start any script as root.
#
# Note this deliberately runs `node dist/app.js` rather than `npm start`:
# `npm start` fires the prestart hook, which rimrafs dist and recompiles from
# src/ -- and the deploy ships only the compiled dist/, so that would delete
# the build and fail.

set -euo pipefail

APP_DIR=/var/www/wrestling-node
APP_UID=wrestlingdb-api

# npm -g installs land outside root's default PATH under sudo.
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$APP_DIR"

if forever list | grep -q "$APP_UID"; then
    forever restart "$APP_UID"
else
    forever start --uid "$APP_UID" -a --workingDir "$APP_DIR" dist/app.js
fi

forever list
