#!/bin/bash
set -e
echo "Exporting verification key hash..."
cd "$(dirname "$0")/word_count/script"
SP1_PROVER=mock cargo run --release -- --export-vkey | tee ../../../sdk/vkey_hash.txt
echo ""
echo "Saved to sdk/vkey_hash.txt"
