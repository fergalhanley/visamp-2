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
        ("context webgl", ContextKind::WebGl),
        ("context experimental-webgl", ContextKind::ExperimentalWebGl),
        ("context webgl2", ContextKind::WebGl2),
        ("context webgpu", ContextKind::WebGpu),
    ] {
        let script = format!("{source}\n{MINIMAL}");
        let parsed = build_ast(&script).unwrap_or_else(|e| panic!("{source} failed: {e}"));
        assert_eq!(parsed.context, expected, "for {source}");
    }
}

/// `webgl` must not shadow `webgl2`, and `experimental-webgl` must not be
/// swallowed by `webgl` — the grammar orders these longest-first.
#[test]
fn longer_context_names_are_not_shadowed() {
    assert_eq!(
        build_ast(&format!("context webgl2\n{MINIMAL}")).unwrap().context,
        ContextKind::WebGl2
    );
    assert_eq!(
        build_ast(&format!("context experimental-webgl\n{MINIMAL}"))
            .unwrap()
            .context,
        ContextKind::ExperimentalWebGl
    );
}

#[test]
fn context_may_appear_after_other_top_level_items() {
    let script = format!("prop a = 1.0\ncontext webgl2\n{MINIMAL}");
    assert_eq!(build_ast(&script).unwrap().context, ContextKind::WebGl2);
}

#[test]
fn two_contexts_are_an_error() {
    let err = build_ast(&format!("context 2d\ncontext webgl\n{MINIMAL}")).unwrap_err();
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

    let depth = model.decels.scopes.len();
    let first = interpret_event_block(&block, &mut model.decels, &runtime, &functions)
        .expect_err("should fail on the undefined identifier");
    assert_eq!(model.decels.scopes.len(), depth, "scope leaked after frame 1");

    let second = interpret_event_block(&block, &mut model.decels, &runtime, &functions)
        .expect_err("should fail the same way every frame");
    assert_eq!(model.decels.scopes.len(), depth, "scope leaked after frame 2");

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

    let depth = model.decels.scopes.len();
    let first = interpret_event_block(&block, &mut model.decels, &runtime, &functions).unwrap_err();
    let second = interpret_event_block(&block, &mut model.decels, &runtime, &functions).unwrap_err();
    assert_eq!(model.decels.scopes.len(), depth, "scope leaked");
    assert_eq!(first, second, "the reported error changed on the second frame");
}

#[test]
fn a_broken_colour_argument_is_reported_rather_than_read_as_zero() {
    // A colour argument that fails to evaluate used to be swallowed and
    // treated as 0.0, so a typo silently turned the channel black instead of
    // telling the author what was wrong.
    let err = expect_runtime_error(
        "on_frame {\n  let c = color::rgb(red: missing, green: 1.0)\n}\nrender {\n  draw::clear()\n}\n",
    );
    assert!(err.contains("Undefined identifier: missing"), "unexpected: {err}");
}

#[test]
fn an_omitted_colour_channel_still_defaults_to_zero() {
    // Leaving a channel out entirely stays legal — only a present-but-broken
    // argument is an error.
    let source = "prop shade = 0.0\non_frame {\n  let c = color::rgb(red: 1.0, green: 1.0)\n  shade = 1.0\n}\nrender {\n  draw::clear()\n}\n";
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
