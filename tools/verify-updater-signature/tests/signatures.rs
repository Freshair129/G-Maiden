use base64::{engine::general_purpose::STANDARD, Engine};
use verify_updater_signature::verify;

const KEY: &str = "untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n";
const SIG: &str = "untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==";

#[test]
fn verifies_a_real_signature_and_rejects_tampered_content_or_key() {
    let key = STANDARD.encode(KEY);
    let signature = STANDARD.encode(SIG);
    assert!(verify(b"test", &signature, &key).is_ok());
    assert!(verify(b"changed", &signature, &key).is_err());
    assert!(verify(b"test", &signature, &STANDARD.encode("invalid key")).is_err());
    assert!(verify(b"test", &STANDARD.encode("invalid signature"), &key).is_err());
    assert!(verify(b"test", &format!(" {signature}"), &key).is_err());
    assert!(verify(b"test", &signature, &format!("{key}\n")).is_err());
}
