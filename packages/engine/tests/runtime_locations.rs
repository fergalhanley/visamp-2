use std::cell::RefCell;

use visamp_2::interpreter::{interpret_event_block, interpret_render_block, Runtime, Target};
use visamp_2::model::{BlockType, Model};
use visamp_2::parser::build_ast;
use visamp_2::scene::Scene;

fn run(source: &str) -> Result<(), String> {
    let script = build_ast(source).expect("valid syntax");
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let scene = RefCell::new(Scene::default());
    let filter = RefCell::new(String::new());
    for block in &model.blocks {
        if block.block_type == BlockType::Render {
            interpret_render_block(
                block,
                &mut model.decels,
                Target::scene(&scene, &filter),
                &runtime,
                &model.functions,
            )?;
        } else {
            interpret_event_block(block, &mut model.decels, &runtime, &model.functions)?;
        }
    }
    Ok(())
}

fn assert_error(source: &str, line: usize, column: usize, reason: &str) {
    let error = run(source).expect_err("expected runtime failure");
    assert!(
        error.starts_with(&format!("Runtime error:  --> {line}:{column}\n")),
        "wrong location: {error}"
    );
    assert_eq!(error.matches("Runtime error:").count(), 1, "{error}");
    assert!(error.contains(reason), "wrong reason: {error}");
}

#[test]
fn every_lifecycle_and_render_block_locates_its_failing_statement() {
    for block in ["on_init", "on_resize", "on_frame", "render"] {
        assert_error(
            &format!("// leading comment\n{block} {{\n    let value = 1 / 0\n}}"),
            3,
            5,
            "Division by zero",
        );
    }
}

#[test]
fn nested_control_flow_keeps_the_innermost_location() {
    assert_error(
        "render {\n  for i in 0..2 {\n    if i == 0 {\n      while true {\n        let bad = 1 / 0\n      }\n    }\n  }\n}",
        5,
        9,
        "Division by zero",
    );
    assert_error(
        "render {\n  if false {\n  } else {\n    let bad = 1 / 0\n  }\n}",
        4,
        5,
        "Division by zero",
    );
}

#[test]
fn function_statement_and_expression_calls_keep_the_callee_location() {
    let functions = "fn fail() {\n  return 1 / 0\n}\nfn outer() {\n  return fail()\n}\n";
    for call in ["outer()", "let value = outer()"] {
        assert_error(
            &format!("{functions}render {{\n  {call}\n}}"),
            2,
            3,
            "Division by zero",
        );
    }
}

#[test]
fn argument_failures_point_to_the_calling_statement() {
    assert_error(
        "fn helper(value: 0) {\n  return value\n}\nrender {\n  helper(value: 1 / 0)\n}",
        5,
        3,
        "Division by zero",
    );
}

#[test]
fn multiline_statements_and_comments_use_the_first_token_location() {
    assert_error(
        "// café 🌈\r\nrender {\r\n  // comment before statement\r\n    let bad = (\r\n      1 / 0\r\n    )\r\n}",
        4,
        5,
        "Division by zero",
    );
}

#[test]
fn lowered_assignment_forms_preserve_their_source_location() {
    for statement in ["missing += 1", "missing++", "++missing"] {
        assert_error(&format!("render {{\n  {statement}\n}}"), 2, 3, "missing");
    }
}

#[test]
fn builtin_argument_errors_are_located_in_the_render_path() {
    assert_error(
        "context 3d\nrender {\n  draw::cube(size: missing)\n}",
        3,
        3,
        "missing",
    );
}

#[test]
fn loop_and_recursion_limits_have_statement_locations() {
    assert_error("render {\n  while true {}\n}", 2, 3, "while loop exceeded");
    assert_error(
        "fn recurse() {\n  recurse()\n}\nrender {\n  recurse()\n}",
        2,
        3,
        "function call depth exceeded",
    );
}

#[test]
fn range_errors_show_float_type_and_a_working_integer_conversion() {
    for (range, label) in [
        ("0..math::ceil(value: 239.5)", "range end"),
        ("0.0..1", "range start"),
        ("0..1 step 1.0", "range step"),
    ] {
        assert_error(
            &format!("render {{\n  for i in {range} {{}}\n}}"),
            2,
            3,
            &format!("{label} requires an integer, got float"),
        );
    }
    let error = run("render {\n  for i in 0..math::ceil(value: 239.5) {}\n}").unwrap_err();
    assert!(error.contains("float 240.0"), "{error}");
    assert!(error.contains("integer division (\\ 1)"), "{error}");
    run("render {\n  for i in 0..(math::ceil(value: 239.5) \\ 1) {}\n}")
        .expect("the suggested conversion must work");
}

#[test]
fn a_later_execution_does_not_reuse_an_earlier_location() {
    assert_error("render {\n  let bad = 1 / 0\n}", 2, 3, "Division by zero");
    run("render { let good = 1 / 2 }").unwrap();
    assert_error(
        "render {\n\n    let bad = 1 / 0\n}",
        3,
        5,
        "Division by zero",
    );
}
