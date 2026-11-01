use std::{path::PathBuf, time::Duration};

fn main() {
    let root = PathBuf::from(
        std::env::var_os("GMAIDEN_PACKAGE_DATA_ROOT").expect("isolated test root required"),
    );
    assert_eq!(std::env::var("GMAIDEN_INSTANCE_KIND").as_deref(), Ok("test"));
    package_ipc_tests::package_ipc::start(root, true).expect("test host startup");
    println!("Creator UAT test host running; no gameplay runtime");
    std::thread::sleep(Duration::from_secs(600));
}
