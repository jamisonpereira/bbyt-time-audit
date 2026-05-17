#!/usr/bin/env bash
set -euo pipefail

APP_NAME="BBYT - Time Audit.app"
SOURCE_APP="out/BBYT - Time Audit-darwin-arm64/${APP_NAME}"
SCOPE="${1:-system}"

if [[ "${SCOPE}" == "user" ]]; then
  TARGET_DIR="${HOME}/Applications"
else
  TARGET_DIR="/Applications"
fi

TARGET_APP="${TARGET_DIR}/${APP_NAME}"

if [[ ! -d "${SOURCE_APP}" ]]; then
  echo "Packaged app not found at ${SOURCE_APP}."
  echo "Run npm run package first."
  exit 1
fi

mkdir -p "${TARGET_DIR}"
if [[ -w "${TARGET_DIR}" ]]; then
  rm -rf "${TARGET_APP}"
  ditto "${SOURCE_APP}" "${TARGET_APP}"
else
  echo "Installing to ${TARGET_DIR} requires administrator permission."
  sudo rm -rf "${TARGET_APP}"
  sudo ditto "${SOURCE_APP}" "${TARGET_APP}"
fi

echo "Installed ${APP_NAME} to ${TARGET_APP}"
