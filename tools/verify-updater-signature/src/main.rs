use std::{env, fs, process};

fn main() {
    if let Err(err) = run() {
        eprintln!("signature verification failed: {err}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err("expected artifact, signature file and public key file".into());
    }
    let data = fs::read(&args[0]).map_err(|e| e.to_string())?;
    let signature = fs::read_to_string(&args[1]).map_err(|e| e.to_string())?;
    let key = fs::read_to_string(&args[2]).map_err(|e| e.to_string())?;
    verify_updater_signature::verify(&data, &signature, &key)
}
