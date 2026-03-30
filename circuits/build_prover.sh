#!/bin/bash
set -e
echo "Building COVENANT word count prover..."
cd "$(dirname "$0")/word_count/script"
cargo build --release
cp target/release/word-count-script ../../../sdk/bin/covenant-prover
chmod +x ../../../sdk/bin/covenant-prover
echo "Prover binary at sdk/bin/covenant-prover"
