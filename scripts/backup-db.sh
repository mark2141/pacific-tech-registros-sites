#!/usr/bin/env bash
#
# Respaldo de la base de datos de Netlify (Postgres/Neon).
#
# Hace un pg_dump completo y lo guarda comprimido, con la fecha en el nombre,
# en una carpeta local. No sube nada a ningún sitio ni toca la base: solo lee.
#
# La cadena de conexión sale de:
#
#     netlify db status --show-credentials
#
# y se pasa por la variable NETLIFY_DB_URL (la misma que usa el sitio). Para
# no dejar la credencial en el historial, puede leerse sin eco:
#
#     bash
#     read -r -s -p "NETLIFY_DB_URL: " NETLIFY_DB_URL; printf '\n'
#     export NETLIFY_DB_URL
#     bash scripts/backup-db.sh
#     unset NETLIFY_DB_URL
#     exit
#
# El destino es ./backups por defecto; se cambia con BACKUP_DIR:
#
#     BACKUP_DIR=/ruta/segura bash scripts/backup-db.sh
#
# IMPORTANTE: el volcado contiene datos de clientes (nombres, teléfonos,
# correos). Guárdalo en un lugar seguro y no lo subas al repositorio: la
# carpeta backups/ ya está en .gitignore.

set -euo pipefail

# Dumps y temporales pueden contener PII. Aunque el directorio ya exista con
# otros permisos, cada archivo creado por este proceso queda legible solo por
# su propietario.
umask 077

# --- Cadena de conexión -----------------------------------------------------
CONNECTION="${NETLIFY_DB_URL:-}"
if [ -z "$CONNECTION" ]; then
  echo "Falta la cadena de conexión." >&2
  echo "Pásala mediante la variable NETLIFY_DB_URL." >&2
  echo "La obtienes con: netlify db status --show-credentials" >&2
  exit 1
fi

# --- Herramienta ------------------------------------------------------------
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "No encuentro pg_dump. Instala el cliente de Postgres:" >&2
  echo "  macOS:   brew install libpq   (y añade libpq/bin al PATH)" >&2
  echo "  Ubuntu:  sudo apt install postgresql-client" >&2
  exit 1
fi

# --- Destino ----------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"

KEEP="${BACKUP_KEEP:-30}"
if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP debe ser un entero mayor o igual a 1." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TMPFILE="$(mktemp "$BACKUP_DIR/.pacifictech-backup.XXXXXX")"
SUFFIX="${TMPFILE##*.}"
OUTFILE="$BACKUP_DIR/pacifictech-$STAMP-$SUFFIX.dump"

cleanup() {
  if [ -n "${TMPFILE:-}" ] && [ -f "$TMPFILE" ]; then
    rm -f "$TMPFILE"
  fi
}
trap cleanup EXIT
# Interrumpir debe terminar el proceso; el trap EXIT anterior elimina cualquier
# temporal que haya quedado a medio escribir.
trap 'exit 1' HUP INT TERM

# --- Volcado ----------------------------------------------------------------
# -Fc  formato "custom": comprimido y restaurable con pg_restore de forma
#      selectiva (una tabla, solo el esquema, etc.).
# --no-owner / --no-privileges: el respaldo se restaura en cualquier base sin
#      arrastrar roles de Neon que no existen fuera.
echo "Respaldando la base de datos en $OUTFILE ..."
# PGDATABASE acepta una URI de libpq y evita exponerla en los argumentos que
# muestra `ps`. Sigue siendo un secreto de entorno: no se imprime ni registra.
PGDATABASE="$CONNECTION" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$TMPFILE"

# El nombre definitivo aparece solo cuando pg_dump terminó correctamente. El
# rename ocurre dentro del mismo directorio y por ello es atómico.
mv "$TMPFILE" "$OUTFILE"
TMPFILE=""

SIZE="$(du -h "$OUTFILE" | cut -f1)"
echo "Listo: $OUTFILE ($SIZE)"

# --- Poda: conservar los últimos 30 respaldos -------------------------------
# Bash 3.2 (el que aún incluyen muchas versiones de macOS) no tiene mapfile.
# Tampoco se guarda la lista en un array vacío: con `set -u`, Bash 3.2 trata
# ese array como variable no definida. Los nombres son generados por este
# script y nunca contienen saltos de línea.
REMOVED=0
while IFS= read -r file; do
  REMOVED=$((REMOVED + 1))
  echo "Eliminando respaldo antiguo: $(basename "$file")"
  rm -f "$file"
done < <(ls -1t "$BACKUP_DIR"/pacifictech-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))")
if [ "$REMOVED" -gt 0 ]; then
  echo "Se eliminaron $REMOVED respaldo(s) antiguo(s); se conservan $KEEP."
fi

echo
echo "Para restaurar sobre una base vacía:"
echo "  PGDATABASE=\"\$NETLIFY_DB_URL\" pg_restore --no-owner --no-privileges \\"
echo "    --clean --if-exists \"$OUTFILE\""
