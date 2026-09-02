use visamp_2::model::{BlockType, ContextKind, Value};
use visamp_2::parser::build_ast;

const MINIMAL: &str = r#"
prop angle = 0.0

render {
  draw::circle(x: 100.0, y: 100.0, radius: 10.0, color: $COLOR_RED)
}
"#;

#[test]
fn parser_basic() {
    let script = build_ast(MINIMAL).expect("should parse");
    assert_eq!(script.blocks.len(), 1);
    assert_eq!(script.blocks[0].block_type, BlockType::Render);
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

// ── context ─────────────────────────────────────────────────────────────────

#[test]
fn context_defaults_to_2d() {
    assert_eq!(build_ast(MINIMAL).unwrap().context, ContextKind::TwoD);
}

#[test]
fn context_can_be_declared() {
    for (source, expected) in [
        ("context 2d", ContextKind::TwoD),
        ("context 3d", ContextKind::ThreeD),
    ] {
        let script = format!("{source}\n{MINIMAL}");
        let parsed = build_ast(&script).unwrap_or_else(|e| panic!("{source} failed: {e}"));
        assert_eq!(parsed.context, expected, "for {source}");
    }
}

/// The backend names are gone entirely — they are not the author's choice any
/// more, so they are rejected like any other unknown value.
#[test]
fn retired_backend_names_are_rejected() {
    for name in ["webgl", "webgl2", "experimental-webgl", "webgpu"] {
        assert!(
            build_ast(&format!("context {name}\n{MINIMAL}")).is_err(),
            "context {name} should not parse"
        );
    }
}

/// `3dsomething` must not match as `3d` and leave a dangling tail.
#[test]
fn a_context_name_must_end_where_it_ends() {
    assert!(build_ast(&format!("context 3dd\n{MINIMAL}")).is_err());
    assert!(build_ast(&format!("context 2different\n{MINIMAL}")).is_err());
}

#[test]
fn context_may_appear_after_other_top_level_items() {
    let script = format!("prop a = 1.0\ncontext 3d\n{MINIMAL}");
    assert_eq!(build_ast(&script).unwrap().context, ContextKind::ThreeD);
}

#[test]
fn two_contexts_are_an_error() {
    let err = build_ast(&format!("context 2d\ncontext 3d\n{MINIMAL}")).unwrap_err();
    assert!(err.contains("already set"), "unexpected message: {err}");
    assert!(err.contains("-->"), "error should carry a position: {err}");
}

#[test]
fn unknown_context_is_an_error() {
    assert!(build_ast(&format!("context vulkan\n{MINIMAL}")).is_err());
}

// ── render ──────────────────────────────────────────────────────────────────

#[test]
fn two_render_blocks_are_an_error() {
    let source = r#"
render {
  draw::clear()
}

render {
  draw::clear()
}
"#;
    let err = build_ast(source).unwrap_err();
    assert!(err.contains("only one render block"), "unexpected: {err}");
    assert!(err.contains("-->"), "error should carry a position: {err}");
}

#[test]
fn layer_2d_is_no_longer_accepted() {
    assert!(build_ast("layer_2d {\n  draw::clear()\n}\n").is_err());
}

#[test]
fn many_on_frame_blocks_are_still_allowed() {
    let source = r#"
prop a = 0.0
prop b = 0.0

on_frame {
  a = $TIME_SEC
}

on_frame {
  b = $TIME_SEC
}

render {
  draw::clear()
}
"#;
    let script = build_ast(source).expect("should parse");
    let on_frame = script
        .blocks
        .iter()
        .filter(|b| b.block_type == BlockType::OnFrame)
        .count();
    assert_eq!(on_frame, 2);
}

// ── lifecycle hooks ─────────────────────────────────────────────────────────

#[test]
fn on_init_and_on_resize_blocks_parse() {
    let source = r#"
on_init {
  a = 1.0
}

on_resize {
  a = 2.0
}

render {
  draw::clear()
}
"#;
    let script = build_ast(source).expect("should parse");
    assert_eq!(
        script.blocks.iter().filter(|b| b.block_type == BlockType::OnInit).count(),
        1
    );
    assert_eq!(
        script.blocks.iter().filter(|b| b.block_type == BlockType::OnResize).count(),
        1
    );
}

/// Same allowance as `on_frame`: nothing restricts a script to one of each.
#[test]
fn many_on_init_and_on_resize_blocks_are_allowed() {
    let source = r#"
prop a = 0.0
prop b = 0.0

on_init {
  a = 1.0
}

on_init {
  b = 1.0
}

on_resize {
  a = 2.0
}

on_resize {
  b = 2.0
}

render {
  draw::clear()
}
"#;
    let script = build_ast(source).expect("should parse");
    assert_eq!(
        script.blocks.iter().filter(|b| b.block_type == BlockType::OnInit).count(),
        2
    );
    assert_eq!(
        script.blocks.iter().filter(|b| b.block_type == BlockType::OnResize).count(),
        2
    );
}

#[test]
fn unknown_block_message_lists_the_lifecycle_hooks() {
    let err = build_ast("on_wibble {\n}\n").unwrap_err();
    assert!(err.contains("on_init"), "unexpected message: {err}");
    assert!(err.contains("on_resize"), "unexpected message: {err}");
}

/// `on_init` and `on_resize` run just like `on_frame`: they can read the
/// runtime and write properties, and cannot draw (draw calls are no-ops
/// outside a render target). Exercised directly against the interpreter
/// rather than through `load_script`/the resize observer, which need a DOM.
#[test]
fn on_init_reads_the_runtime_and_writes_a_property() {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::Model;

    let source = "prop w = 0.0\non_init {\n  w = $WIDTH\n}\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);

    let mut runtime = Runtime::new();
    runtime.canvas_width = 1920.0;
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();

    for block in blocks.iter().filter(|b| b.block_type == BlockType::OnInit) {
        interpret_event_block(block, &mut model.decels, &runtime, &functions)
            .unwrap_or_else(|e| panic!("interpret failed: {e}"));
    }

    assert_eq!(
        model.decels.get("w").cloned(),
        Some(Value::Float(1920.0)),
        "on_init should have read the runtime's canvas_width via $WIDTH"
    );
}

#[test]
fn on_resize_reads_the_runtime_and_writes_a_property() {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::Model;

    let source = "prop h = 0.0\non_resize {\n  h = $HEIGHT\n}\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);

    let mut runtime = Runtime::new();
    runtime.canvas_height = 1080.0;
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();

    for block in blocks.iter().filter(|b| b.block_type == BlockType::OnResize) {
        interpret_event_block(block, &mut model.decels, &runtime, &functions)
            .unwrap_or_else(|e| panic!("interpret failed: {e}"));
    }

    assert_eq!(
        model.decels.get("h").cloned(),
        Some(Value::Float(1080.0)),
        "on_resize should have read the runtime's canvas_height via $HEIGHT"
    );
}

// ── audio bindings ──────────────────────────────────────────────────────────

#[test]
fn audio_system_values_parse() {
    let source = r#"
render {
  for v in $FREQUENCY_DATA {
    draw::rect(x: v, y: 0, width: 2, height: v, color: $COLOR_CYAN)
  }
  for s in $TIME_DOMAIN_DATA {
    draw::line(x1: 0, y1: s, x2: 10, y2: s, color: $COLOR_WHITE)
  }
  if $BEAT {
    draw::circle(x: 50.0, y: 50.0, radius: 20.0, color: $COLOR_RED)
  }
}
"#;
    assert!(build_ast(source).is_ok(), "audio system values should parse");
}

#[test]
fn beat_is_usable_in_on_frame() {
    let source = r#"
prop hits = 0

on_frame {
  if $BEAT {
    hits = hits + 1
  }
}

render {
  draw::circle(x: 10.0, y: 10.0, radius: hits, color: $COLOR_RED)
}
"#;
    assert!(build_ast(source).is_ok());
}

// ── malformed input must never panic ────────────────────────────────────────

/// Regression: `event_block_name` was a normal rule, so pest's implicit
/// whitespace let `on_` swallow the newline and the `render` that followed it,
/// producing a block named "on_\n\nrender" and a panic that killed the editor.
#[test]
fn half_typed_block_name_is_an_error_not_a_panic() {
    let err = build_ast("on_\n\nrender {\n  draw::clear()\n}\n").unwrap_err();
    assert!(!err.is_empty());
}

#[test]
fn typing_a_block_name_one_character_at_a_time_never_panics() {
    // Every prefix of a realistic edit must be survivable — the editor
    // recompiles on a 200ms debounce, so it will see many of these.
    let target = "on_frame {\n  a = 1.0\n}\n\nrender {\n  draw::clear()\n}\n";

    for end in 0..=target.len() {
        if !target.is_char_boundary(end) {
            continue;
        }
        // Must return, not unwind. A panic here fails the test process.
        let _ = build_ast(&target[..end]);
    }
}

#[test]
fn unknown_block_name_reports_a_position() {
    let err = build_ast("on_wibble {\n}\n").unwrap_err();
    assert!(err.contains("-->"), "should carry a position: {err}");
    assert!(err.contains("unknown block"), "unexpected message: {err}");
}

// ── arithmetic ──────────────────────────────────────────────────────────────

/// Regression: `/` used to truncate for two integers, so `$TIME_MS / 5000`
/// stepped 0, 1, 2… and anything driven by it snapped between whole values.
/// Every audio value and several system values are integers, so this was easy
/// to hit and produced no error to trace back from.
#[test]
fn integer_division_produces_a_float() {
    use visamp_2::interpreter::{evaluate_expression, Runtime};
    use visamp_2::model::{Declarations, Value};

    let mut decels = Declarations::new();
    decels.push_scope();
    let runtime = Runtime::new();

    let expr = {
        let parsed = build_ast("prop x = 0.0\non_frame {\n  x = 1 / 2\n}\nrender {\n  draw::clear()\n}\n")
            .expect("should parse");
        match &parsed.blocks[0].statements[0] {
            visamp_2::model::Statement::Assignment(assignment) => assignment.expression.clone(),
            other => panic!("expected an assignment, got {other:?}"),
        }
    };

    let value = evaluate_expression(&expr, &decels, &runtime, &[]).expect("should evaluate");
    assert_eq!(value, Value::Float(0.5), "1 / 2 should be 0.5");
}

// ── range loops ─────────────────────────────────────────────────────────────

/// Runs a script's on_frame and reads back a property, so range behaviour can
/// be asserted on results rather than on the AST.
fn eval_prop(source: &str, prop: &str) -> Value {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::{BlockType, Model};

    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();

    for block in blocks.iter().filter(|b| b.block_type == BlockType::OnFrame) {
        interpret_event_block(block, &mut model.decels, &runtime, &functions)
            .unwrap_or_else(|e| panic!("interpret failed: {e}"));
    }

    model.decels.get(prop).cloned().expect("property not found")
}

const SHELL: &str = "\nrender {\n  draw::clear()\n}\n";

#[test]
fn exclusive_range_counts_up_to_but_not_including_end() {
    let source = format!(
        "prop total = 0\non_frame {{\n  for i in 0..5 {{\n    total = total + i\n  }}\n}}{SHELL}"
    );
    // 0+1+2+3+4
    assert_eq!(eval_prop(&source, "total"), Value::Integer(10));
}

#[test]
fn inclusive_range_includes_the_end() {
    let source = format!(
        "prop total = 0\non_frame {{\n  for i in 0..=5 {{\n    total = total + i\n  }}\n}}{SHELL}"
    );
    // 0+1+2+3+4+5
    assert_eq!(eval_prop(&source, "total"), Value::Integer(15));
}

#[test]
fn step_skips_values() {
    let source = format!(
        "prop total = 0\non_frame {{\n  for i in 0..10 step 2 {{\n    total = total + i\n  }}\n}}{SHELL}"
    );
    // 0+2+4+6+8
    assert_eq!(eval_prop(&source, "total"), Value::Integer(20));
}

#[test]
fn negative_step_counts_down() {
    let source = format!(
        "prop last = 99\non_frame {{\n  for i in 5..0 step -1 {{\n    last = i\n  }}\n}}{SHELL}"
    );
    // 5,4,3,2,1 — 0 excluded
    assert_eq!(eval_prop(&source, "last"), Value::Integer(1));
}

#[test]
fn inclusive_negative_step_reaches_the_end() {
    let source = format!(
        "prop last = 99\non_frame {{\n  for i in 5..=0 step -1 {{\n    last = i\n  }}\n}}{SHELL}"
    );
    assert_eq!(eval_prop(&source, "last"), Value::Integer(0));
}

/// Descending without a negative step is empty, matching Rust — rather than
/// silently reversing, which would hide a mistake.
#[test]
fn descending_range_without_a_negative_step_is_empty() {
    let source = format!(
        "prop runs = 0\non_frame {{\n  for i in 5..0 {{\n    runs = runs + 1\n  }}\n}}{SHELL}"
    );
    assert_eq!(eval_prop(&source, "runs"), Value::Integer(0));
}

#[test]
fn range_bounds_can_be_expressions() {
    let source = format!(
        "prop n = 3\nprop total = 0\non_frame {{\n  for i in 0..n + 1 {{\n    total = total + i\n  }}\n}}{SHELL}"
    );
    // 0..4 -> 0+1+2+3
    assert_eq!(eval_prop(&source, "total"), Value::Integer(6));
}

#[test]
fn arrays_still_iterate() {
    let source = format!(
        "prop total = 0\non_frame {{\n  for v in [1, 2, 3] {{\n    total = total + v\n  }}\n}}{SHELL}"
    );
    assert_eq!(eval_prop(&source, "total"), Value::Integer(6));
}

#[test]
fn identifier_starting_with_step_is_not_read_as_a_step_clause() {
    // `stepper` must parse as the range end, not `step` + `per`.
    let source = "prop stepper = 3\nprop total = 0\non_frame {\n  for i in 0..stepper {\n    total = total + i\n  }\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "total"), Value::Integer(3));
}

/// Runs a script and returns the error, for cases that must be rejected.
fn expect_runtime_error(source: &str) -> String {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::{BlockType, Model};

    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();

    for block in blocks.iter().filter(|b| b.block_type == BlockType::OnFrame) {
        if let Err(e) = interpret_event_block(block, &mut model.decels, &runtime, &functions) {
            return e;
        }
    }
    panic!("expected an error");
}

#[test]
fn float_range_bounds_are_rejected() {
    let err = expect_runtime_error(
        "prop n = 0\non_frame {\n  for i in 0..2.5 {\n    n = i\n  }\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("whole number"), "unexpected: {err}");
}

#[test]
fn zero_step_is_rejected_rather_than_looping_forever() {
    let err = expect_runtime_error(
        "prop n = 0\non_frame {\n  for i in 0..5 step 0 {\n    n = i\n  }\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("cannot be 0"), "unexpected: {err}");
}

/// The interpreter runs inside the frame loop, so an enormous range must fail
/// fast rather than lock the tab.
#[test]
fn an_enormous_range_is_refused() {
    let err = expect_runtime_error(
        "prop n = 0\non_frame {\n  for i in 0..99999999 {\n    n = i\n  }\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("limit is"), "unexpected: {err}");
}

// ── comments ────────────────────────────────────────────────────────────────

#[test]
fn comments_are_ignored() {
    let source = r#"
// leading comment
prop angle = 0.0   // trailing comment

on_frame {
  // inside a block
  angle = $TIME_SEC // after a statement
}

render {
  draw::clear()
}
// trailing comment at end of file, no newline"#;

    let script = build_ast(source).unwrap_or_else(|e| panic!("comments should parse: {e}"));
    assert_eq!(script.props.len(), 1);
    assert_eq!(script.blocks.len(), 2);
}

#[test]
fn a_comment_can_be_the_whole_script_body() {
    let source = "render {\n  // nothing yet\n}\n";
    assert!(build_ast(source).is_ok());
}

/// `//` must read as a comment, not as two division operators.
#[test]
fn double_slash_ends_the_expression() {
    let source = "prop x = 0\non_frame {\n  x = 10 // 5\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Integer(10));
}

/// Single `/` must still divide — the comment rule needs two slashes.
#[test]
fn single_slash_still_divides() {
    let source = "prop x = 0\non_frame {\n  x = 10 / 4\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Float(2.5));
}

/// Strings are atomic, so a `//` inside one is content rather than a comment.
#[test]
fn double_slash_inside_a_string_is_preserved() {
    let source = "render {\n  draw::text(content: \"https://visamp.io\", x: 0, y: 0, size: 12.0, color: $COLOR_WHITE)\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("should parse: {e}"));
    assert_eq!(script.blocks.len(), 1);
    // The draw call survived rather than being swallowed by a comment.
    assert_eq!(script.blocks[0].statements.len(), 1);
}

#[test]
fn a_comment_between_range_parts_is_fine() {
    let source = "prop total = 0\non_frame {\n  for i in 0..3 { // counts 0 1 2\n    total = total + i\n  }\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "total"), Value::Integer(3));
}

// ── integer division ────────────────────────────────────────────────────────

fn eval_expr_prop(expr: &str) -> Value {
    let source = format!(
        "prop x = 0\non_frame {{\n  x = {expr}\n}}\nrender {{\n  draw::clear()\n}}\n"
    );
    eval_prop(&source, "x")
}

#[test]
fn backslash_divides_to_an_integer() {
    assert_eq!(eval_expr_prop("10 \\ 4"), Value::Integer(2));
    assert_eq!(eval_expr_prop("9 \\ 3"), Value::Integer(3));
}

/// `/` and `\` must stay distinct: one always float, one always integer.
#[test]
fn slash_and_backslash_differ() {
    assert_eq!(eval_expr_prop("10 / 4"), Value::Float(2.5));
    assert_eq!(eval_expr_prop("10 \\ 4"), Value::Integer(2));
}

/// Floats are accepted — $WIDTH and friends are floats, and rejecting them
/// would make the operator useless for grid maths.
#[test]
fn backslash_accepts_floats_and_truncates() {
    assert_eq!(eval_expr_prop("10.9 \\ 2.0"), Value::Integer(5));
    assert_eq!(eval_expr_prop("7.5 \\ 2"), Value::Integer(3));
}

#[test]
fn backslash_truncates_toward_zero() {
    assert_eq!(eval_expr_prop("-7 \\ 2"), Value::Integer(-3));
}

#[test]
fn backslash_by_zero_is_an_error() {
    let err = expect_runtime_error(
        "prop x = 0\non_frame {\n  x = 5 \\ 0\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("Division by zero"), "unexpected: {err}");
}

/// A backslash must not disturb comments, and `//` must not be read as one.
#[test]
fn backslash_and_comments_coexist() {
    let source = "prop x = 0\non_frame {\n  x = 10 \\ 3 // integer divide\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Integer(3));
}

#[test]
fn backslash_result_is_usable_as_a_range_bound() {
    let source = "prop total = 0\non_frame {\n  for i in 0..(10 \\ 3) {\n    total = total + i\n  }\n}\nrender {\n  draw::clear()\n}\n";
    // 10 \ 3 == 3, so 0..3 -> 0+1+2
    assert_eq!(eval_prop(source, "total"), Value::Integer(3));
}

// ── array indexing ──────────────────────────────────────────────────────────

#[test]
fn arrays_can_be_indexed() {
    assert_eq!(eval_expr_prop("[10, 20, 30][0]"), Value::Integer(10));
    assert_eq!(eval_expr_prop("[10, 20, 30][2]"), Value::Integer(30));
}

#[test]
fn index_can_be_an_expression() {
    let source = "prop i = 1\nprop x = 0\non_frame {\n  x = [10, 20, 30][i + 1]\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Integer(30));
}

#[test]
fn indexing_chains() {
    assert_eq!(eval_expr_prop("[[1, 2], [3, 4]][1][0]"), Value::Integer(3));
}

/// Out of range reads as 0 rather than failing. The audio arrays are empty
/// whenever nothing is playing, so erroring would break every audio-reactive
/// script the moment it fell silent.
#[test]
fn out_of_range_reads_as_zero() {
    assert_eq!(eval_expr_prop("[1, 2, 3][99]"), Value::Integer(0));
    assert_eq!(eval_expr_prop("[1, 2, 3][-1]"), Value::Integer(0));
}

#[test]
fn indexing_an_empty_audio_array_is_safe() {
    // No audio is connected in this test runtime, so the array is empty.
    assert_eq!(eval_expr_prop("$FREQUENCY_DATA[0]"), Value::Integer(0));
    assert_eq!(eval_expr_prop("$TIME_DOMAIN_DATA[512]"), Value::Integer(0));
}

#[test]
fn indexing_a_non_array_is_an_error() {
    let err = expect_runtime_error(
        "prop x = 0\non_frame {\n  x = 5[0]\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("cannot index into"), "unexpected: {err}");
}

#[test]
fn a_float_index_is_rejected() {
    let err = expect_runtime_error(
        "prop x = 0\non_frame {\n  x = [1, 2, 3][1.5]\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("whole number"), "unexpected: {err}");
}

/// Indexing binds tighter than arithmetic: `a[0] * 2`, not `a[0 * 2]`.
#[test]
fn indexing_binds_tighter_than_arithmetic() {
    assert_eq!(eval_expr_prop("[10, 20, 30][1] * 2"), Value::Integer(40));
}

/// An array literal used directly as a for-loop iterable must not be swallowed
/// by the postfix index rule.
#[test]
fn array_literals_still_work_as_iterables() {
    let source = "prop total = 0\non_frame {\n  for v in [1, 2, 3] {\n    total = total + v\n  }\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "total"), Value::Integer(6));
}

/// Nested array literals as arguments (draw::polygon points) must still parse.
#[test]
fn nested_array_arguments_still_parse() {
    let source = "render {\n  draw::polygon(points: [[0.0, 0.0], [10.0, 0.0], [5.0, 9.0]], color: $COLOR_RED)\n}\n";
    assert!(build_ast(source).is_ok(), "polygon points should still parse");
}

#[test]
fn an_error_inside_a_loop_does_not_leak_its_scope() {
    // A failing statement inside a `for` body used to leave its scope on the
    // stack, so the *next* frame reported the block's own `let` as already
    // declared instead of the real fault, hiding the actual mistake.
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::{BlockType, Model};

    let source = "on_frame {\n  let outer = 1\n  for i in 0..4 {\n    let inner = missing\n  }\n}\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let block = model
        .blocks
        .iter()
        .find(|b| b.block_type == BlockType::OnFrame)
        .cloned()
        .expect("on_frame block");

    let depth = model.decels.depth();
    let first = interpret_event_block(&block, &mut model.decels, &runtime, &functions)
        .expect_err("should fail on the undefined identifier");
    assert_eq!(model.decels.depth(), depth, "scope leaked after frame 1");

    let second = interpret_event_block(&block, &mut model.decels, &runtime, &functions)
        .expect_err("should fail the same way every frame");
    assert_eq!(model.decels.depth(), depth, "scope leaked after frame 2");

    assert!(first.contains("Undefined identifier: missing"), "unexpected: {first}");
    assert_eq!(first, second, "the reported error changed on the second frame");
}

#[test]
fn an_error_inside_an_if_does_not_leak_its_scope() {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::{BlockType, Model};

    let source = "on_frame {\n  let outer = 1\n  if true {\n    let inner = missing\n  }\n}\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let block = model
        .blocks
        .iter()
        .find(|b| b.block_type == BlockType::OnFrame)
        .cloned()
        .expect("on_frame block");

    let depth = model.decels.depth();
    let first = interpret_event_block(&block, &mut model.decels, &runtime, &functions).unwrap_err();
    let second = interpret_event_block(&block, &mut model.decels, &runtime, &functions).unwrap_err();
    assert_eq!(model.decels.depth(), depth, "scope leaked");
    assert_eq!(first, second, "the reported error changed on the second frame");
}

#[test]
fn a_broken_colour_argument_is_reported_rather_than_read_as_zero() {
    // A colour argument that fails to evaluate used to be swallowed and
    // treated as 0.0, so a typo silently turned the channel black instead of
    // telling the author what was wrong.
    let err = expect_runtime_error(
        "on_frame {\n  let c = color::rgb(r: missing, g: 1.0)\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("Undefined identifier: missing"), "unexpected: {err}");
}

#[test]
fn an_omitted_colour_channel_still_defaults_to_zero() {
    // Leaving a channel out entirely stays legal — only a present-but-broken
    // argument is an error.
    let source = "prop shade = 0.0\non_frame {\n  let c = color::rgb(r: 1.0, g: 1.0)\n  shade = 1.0\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "shade"), Value::Float(1.0));
}

#[test]
fn properties_keep_their_declared_order() {
    // The scope is a HashMap, so without the recorded order the inspector
    // would shuffle the list between runs.
    let source = "prop zoom = 0.5\nprop angle = 0.0\nprop label = \"hi\"\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let model = visamp_2::model::Model::from_script(&script);
    assert_eq!(model.prop_names, vec!["zoom", "angle", "label"]);
}

#[test]
fn property_values_render_readably() {
    use visamp_2::model::{Color, Value};

    assert_eq!(Value::Float(0.5).display(), "0.5");
    assert_eq!(Value::Float(0.0).display(), "0");
    // Every frame changes the trailing digits; three decimals stays legible.
    assert_eq!(Value::Float(1.0 / 3.0).display(), "0.333");
    assert_eq!(Value::Integer(-7).display(), "-7");
    assert_eq!(Value::Boolean(true).display(), "true");
    assert_eq!(Value::String("hi".into()).display(), "\"hi\"");
    assert_eq!(
        Value::Color(Color::new(1.0, 0.0, 0.5, 1.0)).display(),
        "rgba(1, 0, 0.5, 1)"
    );
}

#[test]
fn non_finite_property_values_do_not_masquerade_as_numbers() {
    use visamp_2::model::Value;

    // These are not representable in JSON; emitting them raw would produce a
    // payload the inspector could not parse at all.
    assert_eq!(Value::Float(f64::NAN).display(), "NaN");
    assert_eq!(Value::Float(f64::INFINITY).display(), "∞");
    assert_eq!(Value::Float(f64::NEG_INFINITY).display(), "-∞");
}

#[test]
fn long_arrays_are_summarised_rather_than_dumped() {
    use visamp_2::model::Value;

    let short = Value::Array(vec![Value::Integer(1), Value::Integer(2)]);
    assert_eq!(short.display(), "[1, 2]");

    let spectrum = Value::Array((0..1024).map(Value::Integer).collect());
    let shown = spectrum.display();
    assert!(shown.starts_with("[0, 1, 2, 3, 4, 5, 6, 7, … 1024 items]"), "unexpected: {shown}");
}

#[test]
fn a_property_can_be_initialised_from_a_system_value() {
    // `prop tint = $COLOR_CRIMSON` used to store the bare token, which then
    // panicked the moment anything asked it for a colour — and a wasm panic
    // aborts mid-frame, freezing the canvas until the page is reloaded.
    use visamp_2::model::Value;

    let source = "prop tint = $COLOR_CRIMSON\nprop turn = $PI\nrender {\n  draw::clear()\n}\n";
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let model = visamp_2::model::Model::from_script(&script);

    assert!(
        matches!(model.decels.get("tint"), Some(Value::Color(_))),
        "expected a resolved colour, got {:?}",
        model.decels.get("tint")
    );
    assert_eq!(
        model.decels.get("turn").and_then(|v| v.as_f64()),
        Some(std::f64::consts::PI)
    );
}

#[test]
fn a_wrongly_typed_colour_argument_is_an_error_not_a_panic() {
    let err = expect_runtime_error(
        "on_frame {\n  let c = math::floor(value: $COLOR_RED)\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("Expected a number"), "unexpected: {err}");
}

// ── Boolean operators ─────────────────────────────────────────────────────

#[test]
fn logical_and_or_and_not() {
    assert_eq!(eval_expr_prop("true && true"), Value::Boolean(true));
    assert_eq!(eval_expr_prop("true && false"), Value::Boolean(false));
    assert_eq!(eval_expr_prop("false || true"), Value::Boolean(true));
    assert_eq!(eval_expr_prop("false || false"), Value::Boolean(false));
    assert_eq!(eval_expr_prop("!true"), Value::Boolean(false));
    assert_eq!(eval_expr_prop("!(1 > 2)"), Value::Boolean(true));
}

#[test]
fn and_binds_tighter_than_or() {
    // `false && false || true` must be `(false && false) || true`, not
    // `false && (false || true)`.
    assert_eq!(eval_expr_prop("false && false || true"), Value::Boolean(true));
    assert_eq!(eval_expr_prop("true || true && false"), Value::Boolean(true));
}

#[test]
fn comparisons_bind_tighter_than_logical_operators() {
    assert_eq!(eval_expr_prop("1 < 2 && 3 > 2"), Value::Boolean(true));
    assert_eq!(eval_expr_prop("1 + 1 == 2 && 2 * 2 == 4"), Value::Boolean(true));
}

#[test]
fn and_stops_before_evaluating_the_right_side() {
    // The point of short-circuiting: the guard has to actually guard. Dividing
    // by `n` is only safe because the left side already ruled out zero.
    let source = "prop n = 0\nprop safe = false\non_frame {\n  safe = n != 0 && 10 \\ n > 1\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "safe"), Value::Boolean(false));
}

#[test]
fn or_stops_before_evaluating_the_right_side() {
    // `missing` is undeclared, so reaching it at all would be an error.
    let source = "prop ok = false\non_frame {\n  ok = true || missing\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "ok"), Value::Boolean(true));
}

#[test]
fn logical_operators_reject_non_booleans() {
    let err = expect_runtime_error(
        "prop x = 0\non_frame {\n  let a = 1 && true\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("needs a boolean"), "unexpected: {err}");
}

// ── Bitwise operators ─────────────────────────────────────────────────────

#[test]
fn bitwise_and_or_xor() {
    assert_eq!(eval_expr_prop("6 & 3"), Value::Integer(2));
    assert_eq!(eval_expr_prop("6 | 3"), Value::Integer(7));
    assert_eq!(eval_expr_prop("6 ^ 3"), Value::Integer(5));
    assert_eq!(eval_expr_prop("1 | 2 | 4"), Value::Integer(7));
}

#[test]
fn bitwise_precedence_runs_and_then_xor_then_or() {
    // C ordering: `&` tighter than `^` tighter than `|`.
    assert_eq!(eval_expr_prop("1 | 2 ^ 2 & 2"), Value::Integer(1));
    assert_eq!(eval_expr_prop("6 & 3 | 8"), Value::Integer(10));
}

#[test]
fn bitwise_binds_tighter_than_logical() {
    // `1 & 1 == 1` groups as `1 & (1 == 1)` under C precedence, which is a type
    // error — the useful check is that `&&` is looser than `&`.
    assert_eq!(eval_expr_prop("(6 & 2) > 0 && (6 & 1) == 0"), Value::Boolean(true));
}

#[test]
fn bitwise_operators_reject_floats() {
    let err = expect_runtime_error(
        "prop x = 0\non_frame {\n  let a = 6.5 & 3\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("whole numbers"), "unexpected: {err}");
}

#[test]
fn double_and_is_not_read_as_two_bitwise_ands() {
    assert_eq!(eval_expr_prop("true && true"), Value::Boolean(true));
    assert_eq!(eval_expr_prop("true || false"), Value::Boolean(true));
}

// ── Compound assignment and increment ─────────────────────────────────────

#[test]
fn compound_assignment_operators() {
    let run = |op: &str, start: &str| {
        let source = format!(
            "prop x = {start}\non_frame {{\n  x {op} 3\n}}\nrender {{\n  draw::clear()\n}}\n"
        );
        eval_prop(&source, "x")
    };

    assert_eq!(run("+=", "10"), Value::Integer(13));
    assert_eq!(run("-=", "10"), Value::Integer(7));
    assert_eq!(run("*=", "10"), Value::Integer(30));
    assert_eq!(run("%=", "10"), Value::Integer(1));
    // `/` always yields a float, so `/=` does too — same rule as `x = x / 3`.
    assert_eq!(run("/=", "9"), Value::Float(3.0));
}

#[test]
fn compound_assignment_evaluates_the_whole_right_side_first() {
    // `x *= 2 + 3` is `x = x * (2 + 3)`, not `x = x * 2 + 3`.
    let source = "prop x = 10\non_frame {\n  x *= 2 + 3\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Integer(50));
}

#[test]
fn increment_and_decrement() {
    let source = "prop up = 0\nprop down = 10\non_frame {\n  up++\n  down--\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "up"), Value::Integer(1));
    assert_eq!(eval_prop(source, "down"), Value::Integer(9));
}

#[test]
fn increment_accepts_either_spelling() {
    let source = "prop a = 0\nprop b = 0\non_frame {\n  ++a\n  --b\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "a"), Value::Integer(1));
    assert_eq!(eval_prop(source, "b"), Value::Integer(-1));
}

#[test]
fn increment_promotes_a_float_the_way_addition_does() {
    let source = "prop x = 1.5\non_frame {\n  x++\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "x"), Value::Float(2.5));
}

#[test]
fn increment_works_inside_a_loop_body() {
    let source = "prop total = 0\non_frame {\n  for i in 0..5 {\n    total++\n  }\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "total"), Value::Integer(5));
}

#[test]
fn equality_in_a_statement_position_is_not_swallowed_as_an_assignment() {
    // `=` is guarded against `==`, so this is a parse error rather than a
    // silent half-assignment.
    assert!(build_ast("render {\n  x == 1\n}\n").is_err());
}

#[test]
fn bitwise_binds_more_loosely_than_equality() {
    // Inherited from C, and the trap the docs warn about: `flags & 4 == 4`
    // groups as `flags & (4 == 4)`. Locked here so the documented advice to
    // parenthesise stays true.
    let err = expect_runtime_error(
        "prop flags = 4\non_frame {\n  let hit = flags & 4 == 4\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("whole numbers"), "unexpected: {err}");

    let source = "prop flags = 4\nprop hit = false\non_frame {\n  hit = (flags & 4) == 4\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "hit"), Value::Boolean(true));
}

// ── 3D mode: resolver (spec §7, §8, §11) ──────────────────────────────────

/// Spec §11 acceptance tests. Numbering follows the spec so the two stay
/// readable side by side.
const THREE_D_SHELL: &str = "\nrender {\n  draw::clear()\n}\n";

fn resolve_err(source: &str) -> String {
    build_ast(source).unwrap_err()
}

/// §11.9 — a 3d-only call under `context 2d`.
#[test]
fn three_d_calls_are_rejected_in_two_d_mode() {
    for call in [
        "camera::orbit()",
        "camera::position(x: 1)",
        "transform::push()",
        "transform::rotate_y(deg: 1)",
        "light::ambient()",
        "gfx::depth(enabled: true)",
        "gfx::overlay(enabled: true)",
        "draw::cube()",
        "draw::sphere()",
        "draw::mesh(vertices: [[0.0, 0.0, 0.0]])",
    ] {
        let err = resolve_err(&format!("render {{\n  {call}\n}}\n"));
        assert!(
            err.contains("only available in 3d mode") && err.contains("context 3d"),
            "for {call}: {err}"
        );
    }
}

/// §11.10 — a promoted argument used without the mode that grants it.
#[test]
fn promoted_arguments_are_rejected_in_two_d_mode() {
    for arg in ["z: 1.0", "rot_x: 90.0", "rot_y: 90.0", "shading: \"lambert\"", "opacity: 0.5"] {
        let err = resolve_err(&format!("render {{\n  draw::rect(x: 0.0, {arg})\n}}\n"));
        assert!(
            err.contains("requires `context 3d`"),
            "for {arg}: {err}"
        );
    }
}

/// §11.11 — the same angle in two units.
#[test]
fn an_angle_given_in_both_units_is_rejected() {
    let err = resolve_err("context 3d\nrender {\n  transform::rotate_y(deg: 1.0, rad: 1.0)\n}\n");
    assert!(err.contains("specify deg or rad, not both"), "{err}");

    let err = resolve_err("context 3d\nrender {\n  camera::perspective(fov_deg: 60.0, fov_rad: 1.0)\n}\n");
    assert!(err.contains("specify fov_deg or fov_rad, not both"), "{err}");

    let err = resolve_err("context 3d\nrender {\n  camera::orbit(yaw_deg: 60.0, yaw_rad: 1.0)\n}\n");
    assert!(err.contains("specify yaw_deg or yaw_rad, not both"), "{err}");
}

/// §11.12 — an argument that does not exist on the primitive.
#[test]
fn an_unknown_argument_is_rejected_and_suggests_a_near_match() {
    let err = resolve_err("context 3d\nrender {\n  draw::cube(radius: 1.0)\n}\n");
    assert!(err.contains("draw::cube: unknown argument 'radius'"), "{err}");

    // Close enough to be worth a suggestion.
    let err = resolve_err("context 3d\nrender {\n  draw::sphere(radus: 1.0)\n}\n");
    assert!(err.contains("did you mean 'radius'?"), "{err}");

    // Far enough that guessing would be noise.
    let err = resolve_err("context 3d\nrender {\n  draw::sphere(qqqqqqqq: 1.0)\n}\n");
    assert!(!err.contains("did you mean"), "{err}");
}

#[test]
fn an_unknown_builtin_is_rejected_and_suggests_a_near_match() {
    let err = resolve_err("context 3d\nrender {\n  draw::cubee()\n}\n");
    assert!(
        err.contains("unknown builtin `draw::cubee`") && err.contains("did you mean `draw::cube`?"),
        "{err}"
    );
}

/// §11.13 — a required argument left out.
#[test]
fn a_missing_required_argument_is_rejected() {
    let err = resolve_err("context 3d\nrender {\n  draw::mesh(indices: [0, 1, 2])\n}\n");
    assert!(
        err.contains("draw::mesh: missing required argument 'vertices'"),
        "{err}"
    );

    // A call with no arguments at all still has to be located somewhere.
    let err = resolve_err("context 3d\nrender {\n  draw::mesh()\n}\n");
    assert!(err.contains("missing required argument 'vertices'"), "{err}");
    assert!(err.contains("--> 3:3"), "should point at the call: {err}");
}

/// §11.14 — a 3d call inside a screen-space overlay bracket.
#[test]
fn three_d_calls_are_rejected_inside_an_overlay_bracket() {
    let source = "context 3d\nrender {\n  gfx::overlay(enabled: true)\n  camera::position(x: 1.0)\n  gfx::overlay(enabled: false)\n}\n";
    let err = resolve_err(source);
    assert!(
        err.contains("camera::position is not available inside gfx::overlay"),
        "{err}"
    );
}

#[test]
fn two_d_drawing_stays_legal_inside_an_overlay_bracket() {
    let source = "context 3d\nrender {\n  gfx::overlay(enabled: true)\n  draw::text(content: \"hi\", x: 0.0, y: 40.0)\n  draw::rect(x: 0.0, y: 0.0, w: 10.0, h: 10.0)\n  gfx::overlay(enabled: false)\n}\n";
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));
}

#[test]
fn leaving_an_overlay_bracket_restores_world_space() {
    let source = "context 3d\nrender {\n  gfx::overlay(enabled: true)\n  draw::text(content: \"hi\", x: 0.0, y: 0.0)\n  gfx::overlay(enabled: false)\n  draw::cube()\n}\n";
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));
}

/// Overlay is tracked as straight-line state. Inside a branch it cannot be
/// known without running the script, so the resolver stops reporting rather
/// than inventing an error for a script that may be perfectly fine.
#[test]
fn a_conditional_overlay_is_not_guessed_at() {
    let source = "context 3d\nprop on = true\nrender {\n  if on {\n    gfx::overlay(enabled: true)\n  }\n  draw::cube()\n}\n";
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));
}

// ── 3D mode: what must be accepted ────────────────────────────────────────

#[test]
fn every_three_d_primitive_parses_with_no_arguments() {
    // §11.2 — each must be legal bare; whether it *renders* is the runtime's
    // job, but nothing here may require an argument except draw::mesh.
    for name in ["cube", "sphere", "plane", "cylinder", "cone", "torus", "sprite"] {
        let source = format!("context 3d\nrender {{\n  draw::{name}()\n}}\n");
        assert!(build_ast(&source).is_ok(), "draw::{name}: {}", resolve_err(&source));
    }
}

#[test]
fn the_full_builtin_surface_resolves() {
    let calls = [
        "camera::perspective(fov_deg: 55.0, near: 0.1, far: 200.0)",
        "camera::orthographic(height: 10.0)",
        "camera::position(x: 0.0, y: 0.0, z: 10.0)",
        "camera::look_at(x: 0.0, y: 0.0, z: 0.0)",
        "camera::direction(x: 0.0, y: 0.0, z: -1.0)",
        "camera::up(x: 0.0, y: 1.0, z: 0.0)",
        "camera::orbit(target_x: 0.0, distance: 10.0, yaw_deg: 20.0, pitch_deg: 15.0)",
        "transform::push()",
        "transform::pop()",
        "transform::identity()",
        "transform::translate(x: 1.0, y: 2.0, z: 3.0)",
        "transform::rotate_x(rad: 1.0)",
        "transform::scale(all: 2.0)",
        "light::ambient(color: $COLOR_WHITE)",
        "light::directional(x: -1.0, y: -2.0, z: -1.0, intensity: 0.8)",
        "light::point(x: 0.0, y: 1.0, z: 0.0, range: 50.0)",
        "gfx::depth(enabled: true, write: false)",
        "gfx::blend(mode: \"additive\")",
        "gfx::cull(mode: \"back\")",
        "gfx::clear(color: $COLOR_BLACK)",
        "draw::cube(size: 2.0)",
        "draw::cube(w: 0.3, h: 1.0, d: 0.3)",
        "draw::torus(radius: 0.5, tube: 0.15, segments: 32, tube_segments: 16)",
        "draw::mesh(vertices: [[0.0, 0.0, 0.0]], indices: [0], normals: [[0.0, 1.0, 0.0]], uvs: [[0.0, 0.0]])",
        "draw::line(x1: 0.0, y1: 0.0, z1: 0.0, x2: 1.0, y2: 1.0, z2: 1.0, stroke_weight: 0.1)",
        "draw::rect(x: 0.0, y: 0.0, w: 2.0, h: 1.0, z: 1.0, rot_x: 90.0, shading: \"unlit\", opacity: 0.5)",
    ];

    for call in calls {
        let source = format!("context 3d\nrender {{\n  {call}\n}}\n");
        assert!(build_ast(&source).is_ok(), "{call}: {}", resolve_err(&source));
    }
}

/// §11.4 — an existing 2D script keeps compiling with `context 3d` prepended.
#[test]
fn a_two_d_script_still_compiles_under_three_d() {
    let source = format!("context 3d{}", SHELL);
    assert!(build_ast(&source).is_ok(), "{}", resolve_err(&source));
}

/// §11.5 — deep nesting is a grammar/resolver non-issue; depth is a runtime
/// limit. This only checks the resolver does not object.
#[test]
fn deeply_nested_push_and_pop_resolve() {
    let mut source = String::from("context 3d\nrender {\n");
    for _ in 0..64 {
        source.push_str("  transform::push()\n");
    }
    for _ in 0..64 {
        source.push_str("  transform::pop()\n");
    }
    source.push_str("}\n");
    assert!(build_ast(&source).is_ok(), "{}", resolve_err(&source));
}

/// §11.3 — the reference script, using this engine's actual system values and
/// colour argument names.
#[test]
fn the_reference_script_compiles() {
    let source = r#"
context 3d

prop bar_count = 128

render {
    gfx::clear(color: color::rgb(r: 0.03, g: 0.03, b: 0.05))
    gfx::blend(mode: "additive")
    gfx::depth(enabled: true, write: false)

    camera::orbit(
        distance: 14.0,
        yaw_deg: $TIME_SEC * 12.0,
        pitch_deg: 25.0,
    )
    camera::perspective(fov_deg: 55.0, near: 0.1, far: 200.0)

    light::ambient(color: color::rgb(r: 0.06, g: 0.06, b: 0.09))
    light::directional(x: -1.0, y: -2.0, z: -1.0, intensity: 0.8)

    for i in 0..bar_count {
        transform::push()
        transform::rotate_y(deg: i / bar_count * 360.0)

        draw::cube(
            x: 6.0,
            y: $FREQUENCY_DATA[i] / 255.0 * 3.0,
            z: 0.0,
            w: 0.3,
            h: $FREQUENCY_DATA[i] / 255.0 * 6.0 + 0.1,
            d: 0.3,
            color: color::hsl(h: i / bar_count, s: 0.9, l: 0.5),
            shading: "lambert",
        )

        transform::pop()
    }

    gfx::overlay(enabled: true)
    draw::text(x: 0.0, y: 40.0, content: "spectrum city")
    gfx::overlay(enabled: false)
}
"#;
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));
}

// ── colour and maths arguments ────────────────────────────────────────────

#[test]
fn colour_constructors_use_short_channel_names() {
    let source = "prop c = 0.0\non_frame {\n  let x = color::rgb(r: 1.0, g: 0.5, b: 0.0)\n  let y = color::hsl(h: 0.5, s: 0.8, l: 0.5)\n  c = 1.0\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "c"), Value::Float(1.0));
}

#[test]
fn transparency_keeps_its_whole_word() {
    let source = "prop c = 0.0\non_frame {\n  let x = color::rgb(r: 1.0, transparent: 0.25)\n  c = 1.0\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "c"), Value::Float(1.0));
}

/// A misspelled channel used to default to 0.0, so the shape simply came out
/// darker than intended with nothing said about it.
#[test]
fn a_misspelled_colour_argument_is_reported() {
    let err = build_ast("render {\n  draw::clear()\n  draw::background(color: color::rgb(red: 1.0))\n}\n")
        .unwrap_err();
    assert!(
        err.contains("color::rgb: unknown argument 'red'") && err.contains("it is 'r' now"),
        "{err}"
    );

    let err = build_ast("render {\n  draw::background(color: color::hsl(hue: 1.0))\n}\n").unwrap_err();
    assert!(err.contains("color::hsl: unknown argument 'hue'"), "{err}");
}

// ── linear gradients ───────────────────────────────────────────────────────

/// Evaluates a single `let g = color::linear_gradient(...)` and hands back the
/// resulting value, the same way `eval_prop` does for `on_frame` properties —
/// a gradient cannot itself be a `prop` (the grammar only allows literals
/// there), so this reads it back from a `let` instead.
fn eval_gradient_let(source: &str) -> Value {
    use visamp_2::interpreter::{evaluate_expression, Runtime};
    use visamp_2::model::{Declarations, Statement};

    let parsed = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let expr = match &parsed.blocks[0].statements[0] {
        Statement::LetDecl(let_decl) => let_decl.expression.clone(),
        other => panic!("expected a let declaration, got {other:?}"),
    };

    let mut decels = Declarations::new();
    decels.push_scope();
    let runtime = Runtime::new();
    evaluate_expression(&expr, &decels, &runtime, &[]).unwrap_or_else(|e| panic!("interpret failed: {e}"))
}

#[test]
fn linear_gradient_parses_with_an_array_of_color_stops() {
    let source = r#"
on_frame {
  let g = color::linear_gradient(
    x0: 0.0, y0: 0.0, x1: 100.0, y1: 0.0,
    color_stops: [
      [0.0, color::rgb(r: 1.0)],
      [0.5, color::rgb(g: 1.0)],
      [1.0, color::rgb(b: 1.0)]
    ]
  )
}
render {
  draw::clear()
}
"#;
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));
}

#[test]
fn linear_gradient_evaluates_its_axis_and_stops() {
    use visamp_2::model::Color;

    let source = "on_frame {\n  let g = color::linear_gradient(x0: 1.0, y0: 2.0, x1: 3.0, y1: 4.0, color_stops: [\n    [0.0, color::rgb(r: 1.0)],\n    [1.0, color::rgb(b: 1.0)]\n  ])\n}\nrender {\n  draw::clear()\n}\n";
    let value = eval_gradient_let(source);

    let Value::Gradient(gradient) = value else {
        panic!("expected a gradient, got {value:?}");
    };
    assert_eq!((gradient.x0, gradient.y0, gradient.x1, gradient.y1), (1.0, 2.0, 3.0, 4.0));
    assert_eq!(gradient.stops.len(), 2);
    assert_eq!(gradient.stops[0].offset, 0.0);
    assert_eq!(gradient.stops[0].color, Color::new(1.0, 0.0, 0.0, 1.0));
    assert_eq!(gradient.stops[1].offset, 1.0);
    assert_eq!(gradient.stops[1].color, Color::new(0.0, 0.0, 1.0, 1.0));
}

/// Same "everything optional, defaults to 0" convention as `color::rgb` and
/// `color::hsl` — a bare `color::linear_gradient()` is a degenerate gradient
/// with no stops rather than a compile error.
#[test]
fn linear_gradient_arguments_are_all_optional() {
    let source = "on_frame {\n  let g = color::linear_gradient()\n}\nrender {\n  draw::clear()\n}\n";
    let value = eval_gradient_let(source);

    let Value::Gradient(gradient) = value else {
        panic!("expected a gradient, got {value:?}");
    };
    assert_eq!((gradient.x0, gradient.y0, gradient.x1, gradient.y1), (0.0, 0.0, 0.0, 0.0));
    assert!(gradient.stops.is_empty());
}

/// An out-of-range offset is clamped rather than rejected — the canvas API
/// itself throws on one, and clamping keeps a slightly-off stop visible
/// pinned to the end instead of losing the whole gradient.
#[test]
fn linear_gradient_offsets_are_clamped() {
    let source = "on_frame {\n  let g = color::linear_gradient(color_stops: [\n    [-0.5, color::rgb(r: 1.0)],\n    [1.5, color::rgb(b: 1.0)]\n  ])\n}\nrender {\n  draw::clear()\n}\n";
    let value = eval_gradient_let(source);

    let Value::Gradient(gradient) = value else {
        panic!("expected a gradient, got {value:?}");
    };
    assert_eq!(gradient.stops[0].offset, 0.0);
    assert_eq!(gradient.stops[1].offset, 1.0);
}

/// A stop that is not a `[number, color]` pair is dropped, not reported — the
/// same treatment `draw::polygon`'s `points` gives a malformed point.
#[test]
fn a_malformed_gradient_stop_is_dropped() {
    let source = "on_frame {\n  let g = color::linear_gradient(color_stops: [\n    [0.0, color::rgb(r: 1.0)],\n    [0.5, 1.0],\n    \"not a stop\"\n  ])\n}\nrender {\n  draw::clear()\n}\n";
    let value = eval_gradient_let(source);

    let Value::Gradient(gradient) = value else {
        panic!("expected a gradient, got {value:?}");
    };
    assert_eq!(gradient.stops.len(), 1, "only the well-formed stop should survive");
}

#[test]
fn a_misspelled_gradient_argument_is_reported() {
    let err = build_ast(
        "render {\n  draw::background(gradient: color::linear_gradient(xx: 1.0))\n}\n",
    )
    .unwrap_err();
    assert!(err.contains("color::linear_gradient: unknown argument 'xx'"), "{err}");
}

/// `gradient` rides alongside `color` on every primitive that can be filled —
/// misspelling it should read as an unknown argument to the primitive, the
/// same as any other.
#[test]
fn draw_rect_accepts_a_gradient_argument() {
    let source = r#"
render {
  draw::rect(
    x: 0.0, y: 0.0, width: 100.0, height: 100.0,
    gradient: color::linear_gradient(
      x0: 0.0, y0: 0.0, x1: 100.0, y1: 0.0,
      color_stops: [[0.0, color::rgb(r: 1.0)], [1.0, color::rgb(b: 1.0)]]
    )
  )
}
"#;
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));

    let err = build_ast("render {\n  draw::rect(gradiant: color::rgb(r: 1.0))\n}\n").unwrap_err();
    assert!(err.contains("unknown argument"), "{err}");
}

/// `draw::line` has no separate fill/stroke split — `color` already draws the
/// stroke — so `gradient` there replaces the stroke rather than a fill.
#[test]
fn draw_line_accepts_a_gradient_argument() {
    let source = r#"
render {
  draw::line(
    x1: 0.0, y1: 0.0, x2: 100.0, y2: 100.0,
    gradient: color::linear_gradient(
      x0: 0.0, y0: 0.0, x1: 100.0, y1: 100.0,
      color_stops: [[0.0, color::rgb(r: 1.0)], [1.0, color::rgb(b: 1.0)]]
    )
  )
}
"#;
    assert!(build_ast(source).is_ok(), "{}", resolve_err(source));

    let err = build_ast("render {\n  draw::line(gradiant: color::rgb(r: 1.0))\n}\n").unwrap_err();
    assert!(err.contains("unknown argument"), "{err}");
}

/// Same trap, same fix: `math::sin(radian: x)` silently returned sin(0).
#[test]
fn a_misspelled_maths_argument_is_reported() {
    let err = build_ast("prop a = 0.0\non_frame {\n  a = math::sin(radian: 1.0)\n}\nrender {\n  draw::clear()\n}\n")
        .unwrap_err();
    assert!(
        err.contains("math::sin: unknown argument 'radian'") && err.contains("did you mean 'radians'?"),
        "{err}"
    );
}

#[test]
fn correct_maths_arguments_still_resolve() {
    for call in [
        "math::sin(radians: 1.0)",
        "math::atan2(x: 1.0, y: 2.0)",
        "math::pow(base: 2.0, exp: 8.0)",
        "math::clamp(value: 5.0, min: 0.0, max: 1.0)",
        "math::min(a: 1.0, b: 2.0)",
    ] {
        let source = format!("prop a = 0.0\non_frame {{\n  a = {call}\n}}\nrender {{\n  draw::clear()\n}}\n");
        assert!(build_ast(&source).is_ok(), "{call}: {:?}", build_ast(&source).err());
    }
}

/// `atan` used to shadow `atan2` in the grammar's ordered alternation, so
/// `math::atan2` never parsed. Locked so the ordering cannot drift back.
#[test]
fn atan2_is_not_shadowed_by_atan() {
    let source = "prop a = 0.0\non_frame {\n  a = math::atan2(y: 1.0, x: 1.0)\n}\nrender {\n  draw::clear()\n}\n";
    let value = eval_prop(source, "a");
    match value {
        Value::Float(f) => assert!((f - std::f64::consts::FRAC_PI_4).abs() < 1e-9, "got {f}"),
        other => panic!("expected a float, got {other:?}"),
    }
}

#[test]
fn maths_names_end_where_they_end() {
    // The trailing guard means a longer identifier cannot match a shorter name.
    assert!(build_ast("prop a = 0.0\non_frame {\n  a = math::sinh(radians: 1.0)\n}\nrender {\n  draw::clear()\n}\n").is_err());
}

/// Calling your own function as a statement never parsed — `fn` was only
/// reachable through `let x = f(...)`, which meant a drawing helper, the main
/// thing `fn` is for, could not be called at all.
#[test]
fn a_user_function_can_be_called_as_a_statement() {
    let source = "fn bump(by: 1.0) {\n  return by\n}\n\nprop total = 0.0\non_frame {\n  bump(by: 2.0)\n  total = 1.0\n}\nrender {\n  draw::clear()\n}\n";
    assert!(build_ast(source).is_ok(), "{:?}", build_ast(source).err());
    assert_eq!(eval_prop(source, "total"), Value::Float(1.0));
}

#[test]
fn a_statement_call_still_resolves_defaults() {
    let source = "fn f(a: 5.0) {\n  return a\n}\n\nprop out = 0.0\non_frame {\n  f()\n  out = 1.0\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "out"), Value::Float(1.0));
}

#[test]
fn a_builtin_call_is_still_matched_before_a_user_call() {
    // `draw::circle(...)` must stay a builtin, not be read as a user function
    // named `draw`.
    let source = "render {\n  draw::circle(x: 1.0, y: 1.0, radius: 1.0)\n}\n";
    let script = build_ast(source).unwrap();
    let block = &script.blocks[0];
    assert!(
        matches!(block.statements[0], visamp_2::model::Statement::FunctionCall(_)),
        "expected a builtin call, got {:?}",
        block.statements[0]
    );
}

#[test]
fn calling_an_undefined_function_is_an_error() {
    let err = expect_runtime_error(
        "on_frame {\n  nope(a: 1.0)\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("Undefined function: nope"), "{err}");
}

// ── audio arrays are shared, not materialised ─────────────────────────────

/// Sets up a runtime with a known spectrum and runs `on_frame`.
fn eval_prop_with_audio(source: &str, prop: &str) -> Value {
    use visamp_2::interpreter::{interpret_event_block, Runtime};
    use visamp_2::model::{BlockType, Model};

    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);

    let mut runtime = Runtime::new();
    runtime.frequency = std::rc::Rc::new((0..1024).map(|i| (i % 256) as u8).collect());
    runtime.time_domain = std::rc::Rc::new(vec![128; 2048]);

    let functions = model.functions.clone();
    let blocks = model.blocks.clone();
    for block in blocks.iter().filter(|b| b.block_type == BlockType::OnFrame) {
        interpret_event_block(block, &mut model.decels, &runtime, &functions).unwrap();
    }

    model.decels.get(prop).cloned().expect("prop")
}

#[test]
fn an_audio_array_can_be_indexed() {
    // The buffer is handed to the script by reference rather than expanded into
    // a thousand boxed integers, so this must still read the right byte.
    let source = "prop v = 0\non_frame {\n  v = $FREQUENCY_DATA[7]\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop_with_audio(source, "v"), Value::Integer(7));

    let source = "prop v = 0\non_frame {\n  v = $FREQUENCY_DATA[300]\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop_with_audio(source, "v"), Value::Integer(44));
}

#[test]
fn reading_past_an_audio_array_gives_zero() {
    // Deliberate: the buffers are empty whenever nothing is playing, and an
    // error would break every audio-reactive script the moment it fell silent.
    for expr in ["$FREQUENCY_DATA[99999]", "$FREQUENCY_DATA[-1]"] {
        let source = format!(
            "prop v = 1\non_frame {{\n  v = {expr}\n}}\nrender {{\n  draw::clear()\n}}\n"
        );
        assert_eq!(eval_prop_with_audio(&source, "v"), Value::Integer(0), "{expr}");
    }
}

#[test]
fn an_audio_array_can_be_iterated() {
    let source = "prop total = 0\non_frame {\n  total = 0\n  for v in $TIME_DOMAIN_DATA {\n    total = total + v\n  }\n}\nrender {\n  draw::clear()\n}\n";
    // 2048 samples of 128.
    assert_eq!(eval_prop_with_audio(source, "total"), Value::Integer(2048 * 128));
}

#[test]
fn an_empty_audio_array_iterates_zero_times() {
    let source = "prop total = 5\non_frame {\n  total = 0\n  for v in $FREQUENCY_DATA {\n    total = total + 1\n  }\n}\nrender {\n  draw::clear()\n}\n";
    assert_eq!(eval_prop(source, "total"), Value::Integer(0));
}

#[test]
fn a_fractional_index_into_an_audio_array_is_still_rejected() {
    let source = "prop v = 0\non_frame {\n  v = $FREQUENCY_DATA[1.5]\n}\nrender {\n  draw::clear()\n}\n";
    let err = expect_runtime_error(source);
    assert!(err.contains("whole number"), "{err}");
}

#[test]
fn an_audio_array_reports_itself_as_an_array() {
    use visamp_2::model::Value as V;
    let bytes = V::Bytes(std::rc::Rc::new(vec![1, 2, 3]));
    assert_eq!(bytes.type_tag(), "array");
    assert_eq!(bytes.display(), "[1, 2, 3]");

    let long = V::Bytes(std::rc::Rc::new((0..1024).map(|i| (i % 256) as u8).collect()));
    assert!(long.display().ends_with("… 1024 items]"), "{}", long.display());
}
