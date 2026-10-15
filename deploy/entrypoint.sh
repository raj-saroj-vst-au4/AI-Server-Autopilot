#!/usr/bin/env bash
# One-time DB bring-up (init datadir, create db/user, seed from dump if empty),
# then hand off to supervisord which runs mariadb + backend + frontend + nginx.
set -e

DATADIR=/var/lib/mysql
SOCK=/run/mysqld/mysqld.sock
DBN="${DB_NAME:-autopilot}"
DBU="${DB_USER:-autopilot}"
DBP="${DB_PASSWORD}"

mkdir -p /run/mysqld
# Rootless Docker: the container's root is an unprivileged host user and cannot
# setuid() to the mysql user, so run MariaDB as root with a root-owned datadir.
chown -R root:root /run/mysqld "$DATADIR"

if [ ! -d "$DATADIR/mysql" ]; then
  echo "[init] installing MariaDB system tables"
  mariadb-install-db --user=root --datadir="$DATADIR" --auth-root-authentication-method=normal >/dev/null
fi

echo "[init] starting MariaDB (temporary) for bootstrap"
mariadbd --user=root --datadir="$DATADIR" --socket="$SOCK" --skip-networking &
BOOT_PID=$!
for i in $(seq 1 60); do
  mariadb-admin --socket="$SOCK" ping >/dev/null 2>&1 && break
  sleep 1
done

echo "[init] ensuring database + app user"
mariadb --socket="$SOCK" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DBN}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DBU}'@'%' IDENTIFIED BY '${DBP}';
CREATE USER IF NOT EXISTS '${DBU}'@'localhost' IDENTIFIED BY '${DBP}';
GRANT ALL PRIVILEGES ON \`${DBN}\`.* TO '${DBU}'@'%';
GRANT ALL PRIVILEGES ON \`${DBN}\`.* TO '${DBU}'@'localhost';
FLUSH PRIVILEGES;
SQL

if [ -f /seed/autopilot_dump.sql ]; then
  if ! mariadb --socket="$SOCK" -N -e "SELECT 1 FROM \`${DBN}\`.servers LIMIT 1" >/dev/null 2>&1; then
    echo "[init] seeding database from /seed/autopilot_dump.sql"
    mariadb --socket="$SOCK" < /seed/autopilot_dump.sql
    echo "[init] seed loaded"
  else
    echo "[init] servers table already present — skipping seed"
  fi
fi

echo "[init] stopping temporary MariaDB"
mariadb-admin --socket="$SOCK" shutdown 2>/dev/null || kill "$BOOT_PID" 2>/dev/null || true
wait "$BOOT_PID" 2>/dev/null || true

echo "[init] handing off to supervisord"
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/autopilot.conf
