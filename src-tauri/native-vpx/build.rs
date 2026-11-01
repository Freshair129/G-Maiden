fn main() {
    println!("cargo:rerun-if-changed=src/decoder.c");
    println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
    println!("cargo:rerun-if-env-changed=VCPKG_DEFAULT_TRIPLET");
    let library = vcpkg::Config::new()
        .target_triplet("x64-windows-static-md")
        .find_package("libvpx")
        .expect("Run scripts/setup-native-vpx.ps1 and set VCPKG_ROOT before Cargo");
    let mut build = cc::Build::new();
    build.file("src/decoder.c");
    for include in library.include_paths {
        build.include(include);
    }
    build.compile("gann_vpx_decoder");
}
