// Quick manual demo: feeds some fake "clipboard" text through the
// pattern scanner and prints out whatever it finds, with severity.
// Run with: cargo run --example demo_scan

use safe_paste_lib::patterns::scan_text;

fn main() {
    let fake_clipboard_samples = vec![
        (
            "AWS credentials pasted into a bug report",
            "AKIAIOSFODNN7EXAMPLE",
        ),
        (
            "A credit card someone copied by mistake",
            "My card is 4111 1111 1111 1111, don't share it",
        ),
        (
            "A GitHub token in a code snippet",
            "const token = 'ghp_16C7e42F292c6912E7710c838347Ae178B4a';",
        ),
        (
            "A completely normal sentence",
            "Let's grab lunch at noon tomorrow.",
        ),
    ];

    for (label, text) in fake_clipboard_samples {
        println!("\n--- {label} ---");
        println!("Clipboard text: {text:?}");

        let matches = scan_text(text);

        if matches.is_empty() {
            println!("Result: clean, nothing detected.");
        } else {
            println!("Result: {} match(es) found:", matches.len());
            for m in matches {
                println!(
                    "  [{}] {} -> matched \"{}\"",
                    m.severity, m.name, m.matched_text
                );
            }
        }
    }
}