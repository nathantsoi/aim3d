use std::env;
use std::path::PathBuf;

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let mut build_dir = PathBuf::from(manifest_dir);
    build_dir.pop();
    build_dir.pop();
    build_dir.push("build");

    let lib_dir = format!("{}/lib", build_dir.display());
    println!("cargo:rustc-link-search=native={}", lib_dir);
    println!("cargo:rustc-link-lib=dylib=aim3d_core");

    // Embed rpath so dyld can find libaim3d_core.dylib at runtime
    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_dir);

    tauri_build::build()
}
