#![no_main]
sp1_zkvm::entrypoint!(main);

use sha2::{Sha256, Digest};

pub fn main() {
    // Read private witness: the full text
    let text: String = sp1_zkvm::io::read();

    // Read public inputs
    let min_words: u32 = sp1_zkvm::io::read();
    let expected_hash: [u8; 32] = sp1_zkvm::io::read();

    // 1. Compute sha256(text) and assert it matches the committed hash
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let computed_hash: [u8; 32] = hasher.finalize().into();
    assert_eq!(
        computed_hash, expected_hash,
        "Text hash does not match expected hash"
    );

    // 2. Count words: split by whitespace, count non-empty tokens
    let word_count = text.split_whitespace().count() as u32;

    // 3. Assert word count meets minimum
    assert!(
        word_count >= min_words,
        "Word count {} is below minimum {}",
        word_count,
        min_words
    );

    // 4. Commit public inputs so verifier can check them
    sp1_zkvm::io::commit(&min_words);
    sp1_zkvm::io::commit(&computed_hash);
}
