//! Pattern library and matching engine for Safe Paste.
//!
//! Loads pattern definitions from `config/patterns.json`, compiles each
//! regex once, and scans arbitrary text for matches. Severity values now
//! come from Prudential's internal data classification sheet (Risk
//! Category + Sensitivity Level), mapped into CRITICAL/HIGH/MEDIUM.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Raw pattern definition as it appears in config/patterns.json.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PatternDef {
    pub id: String,
    pub name: String,
    pub category: String,
    pub regex: String,
    pub severity: String,
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PatternConfig {
    pub version: String,
    pub patterns: Vec<PatternDef>,
}

/// A pattern definition with its regex pre-compiled, ready to scan against.
pub struct CompiledPattern {
    pub id: String,
    pub name: String,
    pub category: String,
    pub severity: String,
    pub regex: Regex,
}

/// Result of a single pattern match against a piece of text.
#[derive(Debug, Clone, Serialize)]
pub struct PatternMatch {
    pub id: String,
    pub name: String,
    pub category: String,
    pub severity: String,
    pub matched_text: String,
    pub byte_range: (usize, usize),
}

/// Loads pattern definitions from a JSON file at the given path.
pub fn load_pattern_config<P: AsRef<Path>>(path: P) -> Result<PatternConfig, String> {
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("failed to read pattern config: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("failed to parse pattern config: {e}"))
}

/// Compiles all pattern definitions into ready-to-use regexes.
/// Patterns that fail to compile are skipped with a logged warning rather
/// than crashing the whole scanner.
pub fn compile_patterns(config: &PatternConfig) -> Vec<CompiledPattern> {
    config
        .patterns
        .iter()
        .filter_map(|def| match Regex::new(&def.regex) {
            Ok(re) => Some(CompiledPattern {
                id: def.id.clone(),
                name: def.name.clone(),
                category: def.category.clone(),
                severity: def.severity.clone(),
                regex: re,
            }),
            Err(e) => {
                eprintln!("[patterns] skipping invalid pattern '{}': {e}", def.id);
                None
            }
        })
        .collect()
}

/// Lazily loaded, process-wide compiled pattern set.
static COMPILED_PATTERNS: Lazy<Vec<CompiledPattern>> = Lazy::new(|| {
    let config_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("config")
        .join("patterns.json");

    match load_pattern_config(&config_path) {
        Ok(config) => compile_patterns(&config),
        Err(e) => {
            eprintln!("[patterns] failed to load pattern config: {e}");
            Vec::new()
        }
    }
});

/// Scans the given text against every compiled pattern and returns all
/// matches found.
pub fn scan_text(text: &str) -> Vec<PatternMatch> {
    let mut matches = Vec::new();

    for pattern in COMPILED_PATTERNS.iter() {
        for m in pattern.regex.find_iter(text) {
            // Credit card and debit card matches get an extra Luhn check
            // before being reported, since the regex alone catches a lot
            // of coincidental digit sequences.
            if pattern.id == "credit_card_number"
                && !passes_luhn(m.as_str())
            {
                continue;
            }

            // ABA routing numbers have a real checksum formula (not just
            // "9 digits"), so validate it before reporting a match.
            if pattern.id == "aba_routing_number" && !passes_aba_checksum(m.as_str()) {
                continue;
            }

            matches.push(PatternMatch {
                id: pattern.id.clone(),
                name: pattern.name.clone(),
                category: pattern.category.clone(),
                severity: pattern.severity.clone(),
                matched_text: m.as_str().to_string(),
                byte_range: (m.start(), m.end()),
            });
        }
    }

    matches
}

/// Standard Luhn checksum validation for credit/debit-card-shaped digit
/// strings.
fn passes_luhn(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() < 12 {
        return false;
    }

    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| {
            if i % 2 == 1 {
                let doubled = d * 2;
                if doubled > 9 {
                    doubled - 9
                } else {
                    doubled
                }
            } else {
                d
            }
        })
        .sum();

    sum % 10 == 0
}

/// ABA routing number checksum: weights 3,7,1 repeated across the 9
/// digits, summed, must be divisible by 10.
fn passes_aba_checksum(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() != 9 {
        return false;
    }

    let weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    let sum: u32 = digits.iter().zip(weights.iter()).map(|(d, w)| d * w).sum();

    sum % 10 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> PatternConfig {
        load_pattern_config(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("config")
                .join("patterns.json"),
        )
        .expect("test pattern config should load")
    }

    #[test]
    fn loads_and_compiles_all_patterns() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        assert_eq!(compiled.len(), config.patterns.len());
    }

    #[test]
    fn detects_aws_access_key() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "aws_access_key").unwrap();
        assert!(pattern.regex.is_match("AKIAIOSFODNN7EXAMPLE"));
        assert!(!pattern.regex.is_match("not-a-real-key-at-all"));
    }

    #[test]
    fn detects_github_token() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "github_token").unwrap();
        assert!(pattern
            .regex
            .is_match("ghp_16C7e42F292c6912E7710c838347Ae178B4a"));
    }

    #[test]
    fn detects_private_key_block() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled
            .iter()
            .find(|p| p.id == "private_key_block")
            .unwrap();
        assert!(pattern.regex.is_match("-----BEGIN RSA PRIVATE KEY-----"));
        assert!(pattern.regex.is_match("-----BEGIN OPENSSH PRIVATE KEY-----"));
    }

    #[test]
    fn detects_valid_ssn_format() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "ssn_us").unwrap();
        assert!(pattern.regex.is_match("123-45-6789"));
    }

    #[test]
    fn credit_card_requires_luhn_pass() {
        let valid = "4111111111111111";
        let invalid = "4111111111111112";

        let matches_valid = scan_text(valid);
        let matches_invalid = scan_text(invalid);

        assert!(matches_valid.iter().any(|m| m.id == "credit_card_number"));
        assert!(!matches_invalid
            .iter()
            .any(|m| m.id == "credit_card_number"));
    }


    #[test]
    fn aba_routing_number_checksum() {
        // 021000021 is a real, publicly documented Chase ABA routing number.
        assert!(passes_aba_checksum("021000021"));
        assert!(!passes_aba_checksum("123456789"));
    }

    #[test]
    fn detects_us_ein_format() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "us_ein").unwrap();
        assert!(pattern.regex.is_match("12-3456789"));
    }

    #[test]
    fn detects_us_itin_format() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "us_itin").unwrap();
        assert!(pattern.regex.is_match("912-70-1234"));
        // Regular SSNs (not starting with 9, or wrong group range) should
        // not match the ITIN pattern.
        assert!(!pattern.regex.is_match("123-45-6789"));
    }

    #[test]
    fn detects_alien_registration_number() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled
            .iter()
            .find(|p| p.id == "alien_registration_number")
            .unwrap();
        assert!(pattern.regex.is_match("A123-456-789"));
        assert!(pattern.regex.is_match("A123456789"));
    }

    #[test]
    fn detects_mac_address() {
        let config = test_config();
        let compiled = compile_patterns(&config);
        let pattern = compiled.iter().find(|p| p.id == "mac_address").unwrap();
        assert!(pattern.regex.is_match("00:1A:2B:3C:4D:5E"));
        assert!(pattern.regex.is_match("00-1A-2B-3C-4D-5E"));
    }

    #[test]
    fn no_false_positive_on_clean_code() {
        let clean_snippet = r#"
            fn add(a: i32, b: i32) -> i32 {
                a + b
            }
        "#;
        let matches = scan_text(clean_snippet);
        assert!(matches.is_empty());
    }
}