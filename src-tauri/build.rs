fn main() {
    println!("cargo:rerun-if-env-changed=COREOR_UPDATER_PUBLIC_KEY");
    tauri_build::build()
}
