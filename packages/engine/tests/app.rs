use visamp_2::parser::build_ast;

#[test]
fn parser_basic() {
    let script = r#"
prop angle = 0.0

layer_2d {
  draw::circle(x: 100.0, y: 100.0, radius: 10.0, color: $COLOR_RED)
}
"#;
    assert!(build_ast(script).is_ok());
}

/// The JS wrapper recovers diagnostic line/column by scraping `--> line:col`
/// out of this string, because `build_ast` flattens pest's structured error.
/// If this assertion ever fails, `parseDiagnostics` in @visamp/player breaks
/// silently and the editor loses its error underlines.
#[test]
fn parse_error_carries_line_and_column() {
    let err = build_ast("prop = 1.0\n").unwrap_err();

    assert!(
        err.contains("-->"),
        "expected a pest location marker in: {err}"
    );

    let loc = err
        .split("-->")
        .nth(1)
        .and_then(|rest| rest.split_whitespace().next())
        .expect("no location after marker");
    let (line, col) = loc.split_once(':').expect("location not line:col");

    assert!(line.parse::<u32>().is_ok(), "bad line in {loc:?}");
    assert!(col.parse::<u32>().is_ok(), "bad column in {loc:?}");
}
