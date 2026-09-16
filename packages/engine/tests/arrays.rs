use std::cell::RefCell;
use std::rc::Rc;
use visamp_2::interpreter::{interpret_event_block, interpret_render_block, Runtime, Target};
use visamp_2::model::{BlockType, Model, Value};
use visamp_2::parser::build_ast;
use visamp_2::scene::Scene;

fn event(model: &mut Model, kind: BlockType, runtime: &Runtime) -> Result<(), String> {
    for block in &model.blocks {
        if block.block_type == kind {
            interpret_event_block(block, &mut model.decels, runtime, &model.functions)?;
        }
    }
    Ok(())
}
fn model(source: &str) -> Model {
    Model::from_script(&build_ast(source).unwrap())
}
fn numbers(model: &Model, name: &str) -> Vec<f64> {
    let Value::Array(values) = model.decels.get(name).unwrap() else {
        panic!("array expected")
    };
    values.iter().map(|v| v.as_f64().unwrap()).collect()
}

#[test]
fn filled_properties_persist_between_frames_and_feed_point_fields() {
    let mut model = model(
        r#"context 3d
prop bands = []
on_init { bands = array::filled(count: 384, value: -1) }
on_frame {
 let audio = audio::detect::get_spectrum()
 for i in 0..384 {
  if audio[i] > 0 { bands[i] = audio[i] }
 }
}
render {
 draw::point_cloud(count: 147456, y: bands[$POINT_INDEX % 384] / 1024.0)
}"#,
    );
    let mut runtime = Runtime::new();
    event(&mut model, BlockType::OnInit, &runtime).unwrap();
    assert_eq!(numbers(&model, "bands"), vec![-1.0; 384]);
    runtime.audio.current.spectrum = Rc::new(vec![0.25, 0.0, 0.75]);
    event(&mut model, BlockType::OnFrame, &runtime).unwrap();
    runtime.audio.current.spectrum = Rc::new(vec![0.0; 384]);
    event(&mut model, BlockType::OnFrame, &runtime).unwrap();
    assert_eq!(&numbers(&model, "bands")[..4], &[0.25, -1.0, 0.75, -1.0]);
    let scene = RefCell::new(Scene::default());
    let render = model
        .blocks
        .iter()
        .find(|b| b.block_type == BlockType::Render)
        .unwrap();
    interpret_render_block(
        render,
        &mut model.decels,
        Target::scene(&scene, &RefCell::new(Vec::new())),
        &runtime,
        &model.functions,
    )
    .unwrap();
    assert_eq!(scene.borrow().point_clouds[0].count, 147456);
    assert_eq!(
        &scene.borrow().point_clouds[0].data[..4],
        &[0.25, -1.0, 0.75, -1.0]
    );
    event(&mut model, BlockType::OnInit, &runtime).unwrap();
    assert_eq!(numbers(&model, "bands"), vec![-1.0; 384]);
}

#[test]
fn compound_writes_use_existing_arithmetic_and_scopes() {
    let mut model = model(
        r#"prop a = [10, 20, 30]
on_init {
 a[0] += 2
 a[0] *= 3
 a[0] -= 1
 a[0] %= 6
 a[0] /= 2
 if true {
  let local = [100]
  local[0] = 200
 }
 let copy = a
 copy[1] = 0
}"#,
    );
    event(&mut model, BlockType::OnInit, &Runtime::new()).unwrap();
    assert_eq!(numbers(&model, "a"), vec![2.5, 20.0, 30.0]);
}

#[test]
fn nested_fills_and_function_arguments_are_independent_values() {
    let mut model = model(
        r#"prop rows = []
prop original = [3]
prop result = []
fn change(a: []) { a[0] += 2 return a }
on_init {
 rows = array::filled(value: [1, 2], count: 2)
 rows[0][1] = 9
 result = change(a: original)
}"#,
    );
    event(&mut model, BlockType::OnInit, &Runtime::new()).unwrap();
    assert_eq!(numbers(&model, "original"), vec![3.0]);
    assert_eq!(numbers(&model, "result"), vec![5.0]);
    let Value::Array(rows) = model.decels.get("rows").unwrap() else {
        panic!()
    };
    for (row, expected) in rows.iter().zip([[1.0, 9.0], [1.0, 2.0]]) {
        let Value::Array(row) = row else { panic!() };
        assert_eq!(
            row.iter().map(|v| v.as_f64().unwrap()).collect::<Vec<_>>(),
            expected
        );
    }
}

#[test]
fn bad_writes_have_locations_and_leave_the_array_unchanged() {
    for (statement, expected) in [
        ("a[-1] = 7", "nonnegative integer"),
        ("a[0.5] = 7", "nonnegative integer"),
        ("a[0.0] = 7", "nonnegative integer"),
        ("a[true] = 7", "nonnegative integer"),
        ("a[2] = 7", "out of bounds"),
        ("a[0][0] = 7", "expected a mutable array"),
        ("missing[0] = 7", "not declared"),
        ("a[0] /= 0", "Division by zero"),
        ("a[0] = 1 / 0", "Division by zero"),
    ] {
        let mut model = model(&format!("prop a = [1, 2]\non_init {{\n  {statement}\n}}"));
        let error = event(&mut model, BlockType::OnInit, &Runtime::new()).unwrap_err();
        assert!(error.contains("3:3"), "{error}");
        assert!(error.contains(expected), "{error}");
        assert_eq!(numbers(&model, "a"), vec![1.0, 2.0]);
    }
}

#[test]
fn constructor_checks_names_types_lengths_and_copy_budget() {
    for args in [
        "",
        "count: 2",
        "value: 0",
        "count: 2, values: 0",
        "count: 2, count: 3, value: 0",
    ] {
        assert!(
            build_ast(&format!("on_init {{ let a = array::filled({args}) }}")).is_err(),
            "{args}"
        );
    }
    for args in [
        "count: -1, value: 0",
        "count: 1.5, value: 0",
        "count: 65537, value: 0",
        "count: true, value: 0",
        "count: 65536, value: array::filled(count: 100, value: 0)",
    ] {
        let mut model = model(&format!("on_init {{ let a = array::filled({args}) }}"));
        assert!(
            event(&mut model, BlockType::OnInit, &Runtime::new()).is_err(),
            "{args}"
        );
    }
    let mut model = model("prop a = []\non_init { a = array::filled(count: 0, value: -1) }");
    event(&mut model, BlockType::OnInit, &Runtime::new()).unwrap();
    assert!(numbers(&model, "a").is_empty());
}

#[test]
fn compound_index_function_is_evaluated_once() {
    let mut model = model(
        r#"prop a = [1]
fn index() {
 let n = 0
 for j in 0..16 {
  for i in 0..10000 { n += 1 }
 }
 return 0
}
on_init { a[index()] += 1 }
"#,
    );
    event(&mut model, BlockType::OnInit, &Runtime::new()).unwrap();
    assert_eq!(numbers(&model, "a"), vec![2.0]);
}

#[test]
fn literal_properties_support_empty_nested_and_typed_elements() {
    let mut m =
        model("prop a = [-1, 2.5]\nprop nested = [[], [true, \"hello\"]]\non_init { a[0] += 2 }");
    event(&mut m, BlockType::OnInit, &Runtime::new()).unwrap();
    assert_eq!(numbers(&m, "a"), vec![1.0, 2.5]);
    let Value::Array(nested) = m.decels.get("nested").unwrap() else {
        panic!()
    };
    assert!(matches!(&nested[0], Value::Array(a) if a.is_empty()));
    let Value::Array(row) = &nested[1] else {
        panic!()
    };
    assert!(matches!(&row[0], Value::Boolean(true)));
    assert!(matches!(&row[1], Value::String(s) if s == "hello"));
}

#[test]
fn audio_snapshots_are_not_mutable_arrays() {
    let mut m = model("on_init { let audio = audio::detect::get_spectrum() audio[0] = 7 }");
    let mut runtime = Runtime::new();
    runtime.audio.current.spectrum = Rc::new(vec![1.0]);
    let error = event(&mut m, BlockType::OnInit, &runtime).unwrap_err();
    assert!(error.contains("expected a mutable array"), "{error}");
    assert_eq!(&*runtime.audio.current.spectrum, &[1.0]);
}

#[test]
fn filled_allocations_share_the_execution_budget() {
    let mut m = model("on_init { for i in 0..20 { let a = array::filled(count: 65536, value: 0) } }");
    let error = event(&mut m, BlockType::OnInit, &Runtime::new()).unwrap_err();
    assert!(error.contains("execution budget exceeded"), "{error}");
}
