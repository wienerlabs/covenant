#!/usr/bin/env bash
# Covenant — mainnet deployment runbook.
#
# Walks through every step needed to get a fresh mainnet deployment
# live. Designed to be SAFE: stops at every cost-incurring step and
# asks for confirmation before touching real funds.
#
# Run from the app/ directory:
#   bash scripts/mainnet-deploy.sh
#
# Prerequisites:
#   - solana CLI installed (`brew install solana` or sh.solana.com)
#   - anchor CLI installed (`cargo install --git https://github.com/coral-xyz/anchor`)
#   - DEPLOYER_KEYPAIR in app/.env (or as env var)
#   - Helius mainnet API key (highly recommended)
#   - ~6 SOL on the deployer wallet (deploy + buffer)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"

red()    { printf "\033[1;31m%s\033[0m\n" "$1"; }
green()  { printf "\033[1;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$1"; }
blue()   { printf "\033[1;34m%s\033[0m\n" "$1"; }

confirm() {
  read -r -p "$1 [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { red "Aborted."; exit 1; }
}

step() {
  echo ""
  blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  blue "  $1"
  blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ----------------------------------------------------------------
step "0. Sanity checks"
# ----------------------------------------------------------------
command -v solana >/dev/null || { red "solana CLI not found"; exit 1; }
command -v anchor >/dev/null || { red "anchor CLI not found"; exit 1; }

DEPLOYER_KEYPAIR_FILE="/tmp/covenant-mainnet-deployer.json"
if [[ -n "${DEPLOYER_KEYPAIR:-}" ]]; then
  echo "$DEPLOYER_KEYPAIR" > "$DEPLOYER_KEYPAIR_FILE"
  chmod 600 "$DEPLOYER_KEYPAIR_FILE"
elif [[ -f "$APP_DIR/.env" ]] && grep -q "^DEPLOYER_KEYPAIR=" "$APP_DIR/.env"; then
  grep "^DEPLOYER_KEYPAIR=" "$APP_DIR/.env" | sed 's/^DEPLOYER_KEYPAIR=//' > "$DEPLOYER_KEYPAIR_FILE"
  chmod 600 "$DEPLOYER_KEYPAIR_FILE"
else
  red "DEPLOYER_KEYPAIR not in env or app/.env"; exit 1
fi
DEPLOYER_PUBKEY=$(solana-keygen pubkey "$DEPLOYER_KEYPAIR_FILE")
green "✓ Deployer pubkey: $DEPLOYER_PUBKEY"

# ----------------------------------------------------------------
step "1. Mainnet balance check"
# ----------------------------------------------------------------
solana config set --url mainnet-beta --keypair "$DEPLOYER_KEYPAIR_FILE" >/dev/null
BALANCE=$(solana balance "$DEPLOYER_KEYPAIR_FILE" --url mainnet-beta | awk '{print $1}')
echo "Current balance: $BALANCE SOL"
if (( $(echo "$BALANCE < 6" | bc -l 2>/dev/null || echo 1) )); then
  red "Need at least 6 SOL on deployer for program deploy + buffer."
  red "Send SOL to $DEPLOYER_PUBKEY then re-run."
  exit 1
fi
green "✓ Sufficient SOL"

# ----------------------------------------------------------------
step "2. Build program"
# ----------------------------------------------------------------
yellow "Running 'anchor build' (~1-3 min)..."
cd "$REPO_ROOT"
anchor build || { red "anchor build failed"; exit 1; }
green "✓ Build OK — target/deploy/covenant.so"

# ----------------------------------------------------------------
step "3. Generate mainnet program ID"
# ----------------------------------------------------------------
MAINNET_KP="$REPO_ROOT/target/deploy/covenant-mainnet-keypair.json"
if [[ ! -f "$MAINNET_KP" ]]; then
  yellow "Generating new mainnet program keypair..."
  solana-keygen new -o "$MAINNET_KP" --no-bip39-passphrase --silent --no-passphrase --force
fi
PROGRAM_ID=$(solana-keygen pubkey "$MAINNET_KP")
green "✓ Mainnet Program ID: $PROGRAM_ID"

# ----------------------------------------------------------------
step "4. Patch declare_id! and rebuild"
# ----------------------------------------------------------------
LIB_RS="$REPO_ROOT/programs/covenant/src/lib.rs"
CURRENT_ID=$(grep 'declare_id!' "$LIB_RS" | sed 's/.*"\(.*\)".*/\1/')
if [[ "$CURRENT_ID" != "$PROGRAM_ID" ]]; then
  yellow "Patching declare_id! ($CURRENT_ID → $PROGRAM_ID)..."
  sed -i.bak "s|declare_id!(\"$CURRENT_ID\")|declare_id!(\"$PROGRAM_ID\")|" "$LIB_RS"
  yellow "Re-running anchor build with new program ID..."
  cd "$REPO_ROOT"
  anchor build || { red "rebuild failed"; exit 1; }
fi
green "✓ Program built with mainnet ID"

# ----------------------------------------------------------------
step "5. Deploy to mainnet (~5 SOL)"
# ----------------------------------------------------------------
yellow "About to spend ~5 SOL on program deploy. This is the costly step."
confirm "Proceed with mainnet program deploy?"

solana program deploy "$REPO_ROOT/target/deploy/covenant.so" \
  --program-id "$MAINNET_KP" \
  --keypair "$DEPLOYER_KEYPAIR_FILE" \
  --url mainnet-beta \
  --upgrade-authority "$DEPLOYER_KEYPAIR_FILE"

green "✓ Program deployed: $PROGRAM_ID"
echo "  Verify: https://explorer.solana.com/address/$PROGRAM_ID"

# ----------------------------------------------------------------
step "6. Initialize ProtocolConfig"
# ----------------------------------------------------------------
if [[ -z "${ARBITRATOR_1:-}" || -z "${ARBITRATOR_2:-}" || -z "${ARBITRATOR_3:-}" ]]; then
  red "Set ARBITRATOR_1, ARBITRATOR_2, ARBITRATOR_3 env vars (3 mainnet pubkeys for dispute multisig)"
  exit 1
fi

yellow "Calling init_config with arbitrators..."
cd "$APP_DIR"
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta \
NEXT_PUBLIC_PROGRAM_ID_MAINNET="$PROGRAM_ID" \
DEPLOYER_KEYPAIR=$(cat "$DEPLOYER_KEYPAIR_FILE") \
ARBITRATOR_1="$ARBITRATOR_1" \
ARBITRATOR_2="$ARBITRATOR_2" \
ARBITRATOR_3="$ARBITRATOR_3" \
ARBITRATOR_THRESHOLD="${ARBITRATOR_THRESHOLD:-2}" \
node scripts/init-config.mjs

green "✓ init_config done"

# ----------------------------------------------------------------
step "7. Print Vercel env vars to copy"
# ----------------------------------------------------------------
yellow "Add these to Vercel project settings (Environment Variables):"
cat <<EOF

  NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
  NEXT_PUBLIC_PROGRAM_ID_MAINNET=$PROGRAM_ID
  HELIUS_API_KEY=<your-helius-mainnet-key>

  # Optional: dedicated overrides
  NEXT_PUBLIC_RPC_URL_MAINNET=https://mainnet.helius-rpc.com/?api-key=<key>
  TRITON_RPC_URL=<triton-fallback-url>

EOF

# ----------------------------------------------------------------
step "8. Bot funding (optional)"
# ----------------------------------------------------------------
if [[ -n "${AGENT_ALPHA_WALLET:-}" || -n "${AGENT_OMEGA_WALLET:-}" ]]; then
  confirm "Fund bot wallets with SOL + USDC now?"
  cd "$APP_DIR"
  NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta \
  SOURCE_KEYPAIR=$(cat "$DEPLOYER_KEYPAIR_FILE") \
  AGENT_ALPHA_WALLET="${AGENT_ALPHA_WALLET:-}" \
  AGENT_OMEGA_WALLET="${AGENT_OMEGA_WALLET:-}" \
  DEPLOYER_WALLET="${DEPLOYER_WALLET:-}" \
  SOL_PER_BOT="${SOL_PER_BOT:-0.05}" \
  USDC_PER_BOT="${USDC_PER_BOT:-10}" \
  node scripts/fund-bots.mjs
fi

# ----------------------------------------------------------------
step "DONE"
# ----------------------------------------------------------------
green "✓ Mainnet program live at: $PROGRAM_ID"
green "✓ ProtocolConfig initialized"
green ""
green "Next steps:"
green "  1. Push the new declare_id! commit to GitHub"
green "  2. Set Vercel env vars (printed above)"
green "  3. Verify cluster badge in NavBar shows 'Mainnet'"
green "  4. Smoke test: connect wallet, /poster, create \$0.10 USDC job"
green ""
green "Rollback: set NEXT_PUBLIC_SOLANA_CLUSTER=devnet and redeploy."
