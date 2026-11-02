use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};

/// Match the Tauri updater's public key and detached signature decoding.
pub fn verify(data: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let key = STANDARD.decode(public_key).map_err(|e| e.to_string())?;
    let sig = STANDARD.decode(signature).map_err(|e| e.to_string())?;
    let key = std::str::from_utf8(&key).map_err(|e| e.to_string())?;
    let sig = std::str::from_utf8(&sig).map_err(|e| e.to_string())?;
    let key = PublicKey::decode(key).map_err(|e| e.to_string())?;
    let sig = Signature::decode(sig).map_err(|e| e.to_string())?;
    key.verify(data, &sig, true).map_err(|e| e.to_string())
}
