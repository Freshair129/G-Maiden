// Shared with debug startup and authoring tests; each consumer uses a subset.
#[allow(dead_code)]
#[path = "events/schema.rs"]
mod event_schema;

fn main() {
    println!("cargo:rerun-if-changed=events/g-events.toml");
    println!("cargo:rerun-if-changed=events/schema.rs");
    let source =
        std::fs::read_to_string("events/g-events.toml").expect("read events/g-events.toml");
    let events = event_schema::parse(&source).unwrap_or_else(|error| panic!("{error}"));
    let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
    std::fs::write(
        output.join("events_gen.rs"),
        event_schema::render_rust(&events),
    )
    .expect("write OUT_DIR/events_gen.rs");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Native AppHandle paths link TaskDialogIndirect; test executables also need ComCtl32 v6.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Tauri already embeds RT_MANIFEST 1 in binaries. Generate it only for the lib harness.
        println!("cargo:rustc-link-arg-bin=g-maiden=/MANIFEST:NO");
    }
}
