use std::cell::RefCell;
use visamp_2::{
    input::{dispatch, InputEvent, InputState},
    interpreter::{
        execution_scope, interpret_event_block, interpret_render_block, Runtime, Target,
    },
    model::{BlockType, Model, Value},
    parser::build_ast,
    scene::Scene,
};
fn enqueue(rt: &mut Runtime, json: &str) {
    rt.input
        .enqueue(InputEvent::from_json(json).unwrap())
        .unwrap();
}
fn run(model: &mut Model, rt: &mut Runtime) -> Result<(), String> {
    let _scope = execution_scope();
    dispatch(&model.blocks, &mut model.decels, rt, &model.functions)?;
    for block in model
        .blocks
        .iter()
        .filter(|b| b.block_type == BlockType::OnFrame)
    {
        interpret_event_block(block, &mut model.decels, rt, &model.functions)?;
    }
    Ok(())
}
fn model(s: &str) -> Model {
    Model::from_script(&build_ast(s).unwrap())
}
#[test]
fn ordered_transitions_are_visible_before_frame_and_not_replayed() {
    let mut m = model(
        r#"prop log = 0
on_input_pointer_down { if input::pointer::state::is_button_down(button: "primary") { log = log * 10 + 1 } }
on_input_pointer_up { if !input::pointer::state::is_button_down(button: "primary") { log = log * 10 + 2 } }
on_frame { if !input::pointer::state::is_button_down(button: "primary") { log = log * 10 + 3 } }
render {}"#,
    );
    let mut rt = Runtime::new();
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_down","button":"primary","buttons":1}"#,
    );
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_up","button":"primary","buttons":0}"#,
    );
    run(&mut m, &mut rt).unwrap();
    assert_eq!(m.decels.get("log"), Some(&Value::Integer(123)));
    run(&mut m, &mut rt).unwrap();
    assert_eq!(m.decels.get("log"), Some(&Value::Integer(1233)));
}
#[test]
fn keyboard_layout_repeats_and_left_right_modifiers() {
    let mut m = model(
        r#"prop repeats = 0
prop released = false
on_input_key_down { if input::keyboard::event::is_repeat() { repeats++ } }
on_input_key_up { released = !input::keyboard::state::is_code_down(code: "KeyA") }
render {}"#,
    );
    let mut rt = Runtime::new();
    enqueue(
        &mut rt,
        r#"{"kind":"key_down","key":"A","code":"KeyA","shift":true}"#,
    );
    enqueue(
        &mut rt,
        r#"{"kind":"key_down","key":"A","code":"KeyA","repeat":true,"shift":true}"#,
    );
    enqueue(&mut rt, r#"{"kind":"key_up","key":"a","code":"KeyA"}"#);
    run(&mut m, &mut rt).unwrap();
    assert_eq!(m.decels.get("repeats"), Some(&Value::Integer(1)));
    assert_eq!(m.decels.get("released"), Some(&Value::Boolean(true)));
}
#[test]
fn matching_helpers_work_but_event_context_does_not_leak() {
    let mut m = model(
        r#"prop x = 0.0
fn event_x() { return input::pointer::event::get_x() }
on_input_pointer_move { x = event_x() }
on_frame { x = event_x() }
render {}"#,
    );
    let mut rt = Runtime::new();
    enqueue(&mut rt, r#"{"kind":"pointer_move","x":-20}"#);
    let e = run(&mut m, &mut rt).unwrap_err();
    assert!(e.contains("matching input event handler"), "{e}");
    assert!(e.contains(" --> "), "{e}");
    assert_eq!(m.decels.get("x"), Some(&Value::Float(-20.0)));
}
#[test]
fn invalid_context_names_arguments_and_retired_constants_fail_compile() {
    for s in [
        "render { let x = input::pointer::event::get_x() }",
        "on_input_pointer_move { let b = input::pointer::event::get_button() } render {}",
        "on_input_key_down { let x = input::pointer::event::get_x() } render {}",
        "render { let x = input::pointer::state::get_z() }",
        "render { let x = input::pointer::state::get_x(extra: 1) }",
        "render { let x = input::pointer::state::is_button_down() }",
        "render { let x = input::pointer::state::is_button_down(button: \"left\") }",
        "render { input::pointer::state::get_x() }",
        "render { let x = $MOUSE_X }",
        "on_input_pointer_move { draw::circle() } render {}",
    ] {
        assert!(build_ast(s).is_err(), "{s}");
    }
}
#[test]
fn dynamic_arguments_and_indirect_drawing_have_located_errors() {
    for body in [
        r#"let bad = 1 let x = input::keyboard::state::is_key_down(key: bad)"#,
        r#"let bad = "left" let x = input::pointer::state::is_button_down(button: bad)"#,
        "draw_it()",
    ] {
        let s = format!(
            "fn draw_it() {{ draw::circle() }}\non_input_pointer_move {{ {body} }} render {{}}"
        );
        let mut m = model(&s);
        let mut rt = Runtime::new();
        enqueue(&mut rt, r#"{"kind":"pointer_move"}"#);
        assert!(run(&mut m, &mut rt).unwrap_err().contains(" --> "));
    }
}
#[test]
fn cancellation_releases_held_state_and_runs_cleanup_handlers() {
    let mut m = model(
        r#"prop cancelled = 0 prop released = 0
on_input_pointer_cancel { cancelled++ }
on_input_key_up { released++ }
render {}"#,
    );
    let mut rt = Runtime::new();
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_down","button":"primary","buttons":1}"#,
    );
    enqueue(
        &mut rt,
        r#"{"kind":"key_down","key":"Shift","code":"ShiftLeft","shift":true}"#,
    );
    run(&mut m, &mut rt).unwrap();
    rt.input.cancel();
    run(&mut m, &mut rt).unwrap();
    assert_eq!(rt.input.buttons, 0);
    assert_eq!(m.decels.get("cancelled"), Some(&Value::Integer(1)));
    assert_eq!(m.decels.get("released"), Some(&Value::Integer(1)));
    assert_eq!(
        rt.input
            .read(
                "input::keyboard::state::is_key_down",
                &[("key".into(), Value::String("Shift".into()))]
            )
            .unwrap(),
        Value::Boolean(false)
    );
}
#[test]
fn errors_still_apply_releases_and_clear_event_context() {
    let mut m = model("on_input_pointer_down { let x = missing } render {}");
    let mut rt = Runtime::new();
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_down","button":"primary","buttons":1}"#,
    );
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_up","button":"primary","buttons":0}"#,
    );
    assert!(run(&mut m, &mut rt).is_err());
    assert_eq!(rt.input.buttons, 0);
    assert!(!rt.input.in_handler());
}
#[test]
fn moves_coalesce_but_scroll_and_button_events_keep_order_with_bounded_queue() {
    let mut m = model("prop moves = 0 on_input_pointer_move { moves++ } render {}");
    let mut rt = Runtime::new();
    for _ in 0..1000 {
        enqueue(&mut rt, r#"{"kind":"pointer_move","x":5}"#);
    }
    run(&mut m, &mut rt).unwrap();
    assert_eq!(m.decels.get("moves"), Some(&Value::Integer(1)));
    for _ in 0..256 {
        enqueue(&mut rt, r#"{"kind":"scroll","delta_y":1}"#);
    }
    assert!(rt
        .input
        .enqueue(InputEvent::from_json(r#"{"kind":"scroll"}"#).unwrap())
        .is_err());
    run(&mut m, &mut rt).unwrap();
    assert_eq!(rt.input.buttons, 0);
}
#[test]
fn all_handlers_parse_and_capabilities_ignore_strings_comments() {
    let handlers = [
        "pointer_move",
        "pointer_down",
        "pointer_up",
        "pointer_cancel",
        "pointer_click",
        "pointer_enter",
        "pointer_leave",
        "scroll",
        "key_down",
        "key_up",
    ];
    for name in handlers {
        assert!(build_ast(&format!("on_input_{name} {{}} render {{}}")).is_ok());
    }
    assert_eq!(
        visamp_2::input_capabilities(
            "// on_input_key_down {}\nprop s = \"input::pointer::state::get_x()\" render {}"
        ),
        0
    );
    assert_eq!(
        visamp_2::input_capabilities(
            "on_input_scroll {} render { let x = input::keyboard::state::is_key_down(key: \"x\") }"
        ),
        6
    );
}
#[test]
fn packets_are_validated_and_initial_state_is_neutral() {
    for packet in [
        r#"{"kind":"nope"}"#,
        r#"{"kind":"pointer_down","button":"left"}"#,
        r#"{"kind":"key_down"}"#,
        r#"{"kind":"pointer_move","buttons":255}"#,
        r#"{"kind":"scroll","extra":1}"#,
    ] {
        assert!(InputEvent::from_json(packet).is_err());
    }
    assert_eq!(
        InputState::default()
            .read("input::pointer::state::get_x", &[])
            .unwrap(),
        Value::Float(0.0)
    );
}
#[test]
fn state_getters_are_valid_gpu_constants() {
    let mut m = model("context 3d render { draw::point_cloud(count: 2, x: $POINT_INDEX + input::pointer::state::get_x()) }");
    let mut rt = Runtime::new();
    rt.input.x = 20.0;
    let scene = RefCell::new(Scene::default());
    interpret_render_block(
        &m.blocks[0],
        &mut m.decels,
        Target::scene(&scene, &RefCell::new(Vec::new())),
        &rt,
        &m.functions,
    )
    .unwrap();
    assert_eq!(scene.borrow().point_clouds.len(), 1);
}

#[test]
fn event_values_and_computed_button_arguments_work() {
    let mut m = model(
        r#"prop key = "" prop code = "" prop dx = 0.0 prop dy = 0.0 prop held = false
on_input_key_down { key = input::keyboard::event::get_key() code = input::keyboard::event::get_code() }
on_input_scroll { dx += input::scroll::event::get_delta_x() dy += input::scroll::event::get_delta_y() }
on_input_pointer_down { held = input::pointer::state::is_button_down(button: "pri" + "mary") }
render {}"#,
    );
    let mut rt = Runtime::new();
    enqueue(&mut rt, r#"{"kind":"key_down","key":"A","code":"KeyA"}"#);
    enqueue(&mut rt, r#"{"kind":"scroll","delta_x":-12.5,"delta_y":8}"#);
    enqueue(
        &mut rt,
        r#"{"kind":"pointer_down","button":"primary","buttons":1}"#,
    );
    run(&mut m, &mut rt).unwrap();
    assert_eq!(m.decels.get("key"), Some(&Value::String("A".into())));
    assert_eq!(m.decels.get("code"), Some(&Value::String("KeyA".into())));
    assert_eq!(m.decels.get("dx"), Some(&Value::Float(-12.5)));
    assert_eq!(m.decels.get("dy"), Some(&Value::Float(8.0)));
    assert_eq!(m.decels.get("held"), Some(&Value::Boolean(true)));
}

#[test]
fn live_testing_samples_compile() {
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("examples/input");
    let mut count = 0;
    for entry in std::fs::read_dir(folder).unwrap() {
        let file = entry.unwrap().path();
        if file.extension().and_then(|s| s.to_str()) == Some("viscript") {
            build_ast(&std::fs::read_to_string(&file).unwrap())
                .unwrap_or_else(|e| panic!("{}: {e}", file.display()));
            count += 1;
        }
    }
    assert_eq!(count, 6);
}
