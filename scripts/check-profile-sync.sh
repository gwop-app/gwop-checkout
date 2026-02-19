#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

compare_file() {
  local lhs="$1"
  local rhs="$2"
  if ! diff -u "$lhs" "$rhs" >/dev/null; then
    echo "Profile drift detected:"
    echo "  - $lhs"
    echo "  - $rhs"
    diff -u "$lhs" "$rhs" || true
    exit 1
  fi
}

compare_file \
  "$ROOT_DIR/apis/gwop-checkout-profile.yaml" \
  "$ROOT_DIR/packages/gwop-checkout/docs/gwop-checkout-profile.yaml"

compare_file \
  "$ROOT_DIR/apis/gwop-checkout-profile.md" \
  "$ROOT_DIR/packages/gwop-checkout/docs/gwop-checkout-profile.md"

echo "Checkout profile docs are in sync."
