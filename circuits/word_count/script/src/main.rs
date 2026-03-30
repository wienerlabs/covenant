use sha2::{Digest, Sha256};
use sp1_sdk::{include_elf, Prover, ProverClient, SP1Stdin};

/// The ELF binary of the word-count program compiled for the SP1 zkVM.
const WORD_COUNT_ELF: sp1_sdk::Elf = include_elf!("word-count-program");

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

fn compute_hash(text: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.finalize().into()
}

async fn run_execution(text: &str, min_words: u32) -> Result<u64, String> {
    let text_hash = compute_hash(text);

    let client = ProverClient::builder().mock().build().await;

    let mut stdin = SP1Stdin::new();
    stdin.write(&text.to_string());
    stdin.write(&min_words);
    stdin.write(&text_hash);

    let (public_values, report) = client
        .execute(WORD_COUNT_ELF.clone(), stdin)
        .await
        .map_err(|e| format!("Execution failed: {}", e))?;

    // Check that public values were committed (a panic means no commits happen)
    let pv_bytes = public_values.as_slice();
    if pv_bytes.is_empty() {
        return Err("Execution produced no public values (program likely panicked)".to_string());
    }

    Ok(report.total_instruction_count())
}

#[tokio::main]
async fn main() {
    // Test 1: 600-word text with min_words = 500 — should succeed
    println!("=== Test 1: 600 words, min_words=500 (should pass) ===");
    let text_600 = generate_text(600);
    match run_execution(&text_600, 500).await {
        Ok(cycles) => println!("PASS: 600-word execution succeeded. Cycles: {}\n", cycles),
        Err(e) => {
            eprintln!("FAIL: {}\n", e);
            std::process::exit(1);
        }
    }

    // Test 2: 100-word text with min_words = 500 — should fail
    println!("=== Test 2: 100 words, min_words=500 (should fail) ===");
    let text_100 = generate_text(100);
    match run_execution(&text_100, 500).await {
        Ok(_) => {
            eprintln!("FAIL: 100-word execution should have failed but succeeded\n");
            std::process::exit(1);
        }
        Err(e) => {
            println!("PASS: 100-word execution correctly failed: {}\n", e);
        }
    }

    println!("=== All circuit tests passed ===");
}
