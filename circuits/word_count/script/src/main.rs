use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sp1_sdk::{include_elf, HashableKey, ProveRequest, Prover, ProvingKey, ProverClient, SP1Stdin};
use std::io::Read;

const WORD_COUNT_ELF: sp1_sdk::Elf = include_elf!("word-count-program");

#[derive(Deserialize)]
struct ProveInput {
    text: String,
    min_words: u32,
}

#[derive(Serialize)]
struct ProveOutput {
    proof: String,
    public_values: String,
}

fn compute_hash(text: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.finalize().into()
}

fn generate_text(word_count: usize) -> String {
    let words: Vec<&str> = vec![
        "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
        "a", "an", "is", "was", "are", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "shall", "can",
        "need", "dare", "ought", "used", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through",
        "during", "before", "after", "above", "below", "between",
        "under", "again", "further", "then", "once", "here", "there",
        "when", "where", "why", "how", "all", "each", "every", "both",
    ];
    (0..word_count)
        .map(|i| words[i % words.len()])
        .collect::<Vec<_>>()
        .join(" ")
}

/// Export the verification key hash for on-chain use.
async fn export_vkey() {
    let client = ProverClient::from_env().await;
    let pk = client.setup(WORD_COUNT_ELF.clone()).await.unwrap();
    let vk = pk.verifying_key();
    println!("{}", vk.bytes32());
}

/// Generate a proof from stdin JSON input, output JSON to stdout.
async fn prove_from_stdin() {
    let mut input_str = String::new();
    std::io::stdin()
        .read_to_string(&mut input_str)
        .expect("Failed to read stdin");

    let input: ProveInput = serde_json::from_str(&input_str).unwrap_or_else(|e| {
        eprintln!("Invalid JSON input: {}", e);
        std::process::exit(1);
    });

    let text_hash = compute_hash(&input.text);

    let client = ProverClient::from_env().await;

    let mut stdin = SP1Stdin::new();
    stdin.write(&input.text);
    stdin.write(&input.min_words);
    stdin.write(&text_hash);

    // First execute to verify correctness
    let (public_values, _report) = client
        .execute(WORD_COUNT_ELF.clone(), stdin.clone())
        .await
        .unwrap_or_else(|e| {
            eprintln!("Execution failed: {}", e);
            std::process::exit(1);
        });

    if public_values.as_slice().is_empty() {
        eprintln!("Execution produced no public values (word count check likely failed)");
        std::process::exit(1);
    }

    // Generate proof (groth16 for production, compressed for mock/testing)
    let pk = client.setup(WORD_COUNT_ELF.clone()).await.unwrap();

    let is_mock = std::env::var("SP1_PROVER")
        .map(|v| v == "mock")
        .unwrap_or(false);

    let proof: sp1_sdk::SP1ProofWithPublicValues = if is_mock {
        // Mock mode: use compressed (fast, no real crypto)
        client
            .prove(&pk, stdin)
            .compressed()
            .await
            .unwrap_or_else(|e| {
                eprintln!("Proof generation failed: {}", e);
                std::process::exit(1);
            })
    } else {
        // Production: use groth16 for on-chain verification
        client
            .prove(&pk, stdin)
            .groth16()
            .await
            .unwrap_or_else(|e| {
                eprintln!("Proof generation failed: {}", e);
                std::process::exit(1);
            })
    };

    // For mock: serialize the full proof; for groth16: use .bytes()
    let proof_bytes = if is_mock {
        bincode::serialize(&proof).unwrap_or_else(|e| {
            eprintln!("Failed to serialize proof: {}", e);
            std::process::exit(1);
        })
    } else {
        proof.bytes()
    };
    let pv_bytes = proof.public_values.to_vec();

    let output = ProveOutput {
        proof: hex::encode(&proof_bytes),
        public_values: hex::encode(&pv_bytes),
    };

    println!("{}", serde_json::to_string(&output).unwrap());
}

/// Run execute-only tests (default mode, no proving).
async fn run_tests() {
    let client = ProverClient::builder().mock().build().await;

    // Test 1: 600 words, min_words=500 — should pass
    println!("=== Test 1: 600 words, min_words=500 (should pass) ===");
    let text_600 = generate_text(600);
    let hash_600 = compute_hash(&text_600);
    let mut stdin1 = SP1Stdin::new();
    stdin1.write(&text_600);
    stdin1.write(&500u32);
    stdin1.write(&hash_600);

    match client.execute(WORD_COUNT_ELF.clone(), stdin1).await {
        Ok((pv, report)) => {
            if pv.as_slice().is_empty() {
                eprintln!("FAIL: no public values\n");
                std::process::exit(1);
            }
            println!("PASS: 600-word execution succeeded. Cycles: {}\n", report.total_instruction_count());
        }
        Err(e) => {
            eprintln!("FAIL: {}\n", e);
            std::process::exit(1);
        }
    }

    // Test 2: 100 words, min_words=500 — should fail
    println!("=== Test 2: 100 words, min_words=500 (should fail) ===");
    let text_100 = generate_text(100);
    let hash_100 = compute_hash(&text_100);
    let mut stdin2 = SP1Stdin::new();
    stdin2.write(&text_100);
    stdin2.write(&500u32);
    stdin2.write(&hash_100);

    match client.execute(WORD_COUNT_ELF.clone(), stdin2).await {
        Ok((pv, _)) => {
            if pv.as_slice().is_empty() {
                println!("PASS: 100-word execution correctly failed (no public values)\n");
            } else {
                eprintln!("FAIL: 100-word execution should have failed\n");
                std::process::exit(1);
            }
        }
        Err(e) => {
            println!("PASS: 100-word execution correctly failed: {}\n", e);
        }
    }

    println!("=== All circuit tests passed ===");
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 && args[1] == "--export-vkey" {
        export_vkey().await;
    } else if args.len() > 1 && args[1] == "--prove" {
        prove_from_stdin().await;
    } else {
        // Check if stdin has data (piped input = prove mode)
        if atty::is(atty::Stream::Stdin) {
            // Interactive terminal = run tests
            run_tests().await;
        } else {
            // Piped stdin = prove mode
            prove_from_stdin().await;
        }
    }
}
