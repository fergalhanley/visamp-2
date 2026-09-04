use visamp_2::{validate_script, COMPILER_VERSION};

const VALID: &str = r#"
render {
  draw::clear()
}
"#;

#[test]
fn native_validation_accepts_a_valid_fixture() {
    assert_eq!(validate_script(VALID), "");
}

#[test]
fn native_validation_returns_positioned_diagnostics() {
    let diagnostic = validate_script("prop = 1.0\n");
    assert!(diagnostic.contains("Parse error"));
    assert!(diagnostic.contains("-->"));
}

#[test]
fn compiler_version_is_the_crate_version() {
    assert_eq!(COMPILER_VERSION, env!("CARGO_PKG_VERSION"));
}
