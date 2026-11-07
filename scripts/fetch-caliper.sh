#!/usr/bin/env bash
set -euo pipefail

# Innerscene original CC0 caliper. Source: https://www.innerscene.com/tools/library/3d-parts/measure-slide-vernier-caliper-e27eece9
# CC0 dedication: https://creativecommons.org/publicdomain/zero/1.0/
source_url="https://files.innerscene.com/library/measure-slide-vernier-caliper-e27eece9/a4bf7006783ae8839a08/vernier-caliper.glb"
target="${1:-public/models/vernier-caliper.glb}"

if [[ -s "$target" ]]; then
  echo "Caliper already vendored: $target"
  exit 0
fi

mkdir -p "$(dirname "$target")"
temporary="$(mktemp)"
trap 'rm -f "$temporary"' EXIT
curl --fail --location --silent --show-error --retry 3 \
  --retry-all-errors --connect-timeout 15 --max-time 90 \
  "$source_url" -o "$temporary"

node - "$temporary" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const file = fs.readFileSync(process.argv[2]);
if (file.length < 1000 || file.length > 6_000_000 ||
    file.subarray(0,4).toString("utf8") !== "glTF" ||
    file.readUInt32LE(4) !== 2 || file.readUInt32LE(8) !== file.length) {
  throw new Error("Invalid / oversized glTF 2.0 caliper binary");
}
console.log("Caliper downloaded & validated:", file.length,
  "bytes, SHA256", crypto.createHash("sha256").update(file).digest("hex"));
NODE
mv "$temporary" "$target"
