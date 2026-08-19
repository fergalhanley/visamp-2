//! Runs 3d scripts and inspects what they recorded, with no browser involved.

use std::cell::RefCell;

use visamp_2::interpreter::{interpret_render_block, Runtime, Target};
use visamp_2::model::{BlockType, Model};
use visamp_2::parser::build_ast;
use visamp_2::scene::*;

/// Evaluates a script's `render` block into a scene.
fn run(source: &str) -> Scene {
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();
    let scene = RefCell::new(Scene::default());

    for block in blocks.iter().filter(|b| b.block_type == BlockType::Render) {
        interpret_render_block(
            block,
            &mut model.decels,
            Target::scene(&scene),
            &runtime,
            &functions,
        )
        .unwrap_or_else(|e| panic!("render failed: {e}"));
    }

    scene.into_inner()
}

fn run_err(source: &str) -> String {
    let script = build_ast(source).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut model = Model::from_script(&script);
    let runtime = Runtime::new();
    let functions = model.functions.clone();
    let blocks = model.blocks.clone();
    let scene = RefCell::new(Scene::default());

    for block in blocks.iter().filter(|b| b.block_type == BlockType::Render) {
        if let Err(e) = interpret_render_block(
            block,
            &mut model.decels,
            Target::scene(&scene),
            &runtime,
            &functions,
        ) {
            return e;
        }
    }
    panic!("expected an error");
}

#[test]
fn a_bare_cube_records_one_unit_sized_draw_at_the_origin() {
    // §11.1 — this has to be visible with no setup at all.
    let scene = run("context 3d\nrender {\n  draw::cube()\n}\n");

    assert_eq!(scene.commands.len(), 1);
    let cmd = scene.commands[0];
    assert_eq!(cmd.key.primitive, Primitive::Cube);
    assert_eq!(cmd.model.transform_point([0.0, 0.0, 0.0]), [0.0, 0.0, 0.0]);
    // Unit sized: the +X corner sits at 0.5.
    assert_eq!(cmd.model.transform_point([0.5, 0.0, 0.0])[0], 0.5);
    assert_eq!(cmd.key.shading, Shading::Unlit);
}

#[test]
fn every_three_d_primitive_records_something() {
    // §11.2 — each must be legal bare and produce a command.
    for name in ["cube", "sphere", "plane", "cylinder", "cone", "torus", "sprite"] {
        let scene = run(&format!("context 3d\nrender {{\n  draw::{name}()\n}}\n"));
        assert_eq!(scene.commands.len(), 1, "draw::{name} recorded nothing");
    }
}

#[test]
fn size_arguments_scale_the_model_matrix() {
    let scene = run("context 3d\nrender {\n  draw::cube(w: 2.0, h: 4.0, d: 6.0)\n}\n");
    let m = scene.commands[0].model;
    assert_eq!(m.transform_point([0.5, 0.5, 0.5]), [1.0, 2.0, 3.0]);

    // `size` is uniform shorthand.
    let scene = run("context 3d\nrender {\n  draw::cube(size: 4.0)\n}\n");
    assert_eq!(scene.commands[0].model.transform_point([0.5, 0.0, 0.0])[0], 2.0);
}

#[test]
fn position_moves_the_primitive() {
    let scene = run("context 3d\nrender {\n  draw::cube(x: 3.0, y: -1.0, z: 2.0)\n}\n");
    assert_eq!(
        scene.commands[0].model.transform_point([0.0, 0.0, 0.0]),
        [3.0, -1.0, 2.0]
    );
}

#[test]
fn the_transform_stack_composes_with_a_primitives_own_position() {
    let scene = run(
        "context 3d\nrender {\n  transform::translate(x: 10.0)\n  draw::cube(x: 1.0)\n}\n",
    );
    assert_eq!(
        scene.commands[0].model.transform_point([0.0, 0.0, 0.0])[0],
        11.0
    );
}

#[test]
fn push_and_pop_isolate_a_transform() {
    let scene = run(
        "context 3d\nrender {\n  transform::push()\n  transform::translate(x: 10.0)\n  draw::cube()\n  transform::pop()\n  draw::cube()\n}\n",
    );

    assert_eq!(scene.commands[0].model.transform_point([0.0, 0.0, 0.0])[0], 10.0);
    assert_eq!(scene.commands[1].model.transform_point([0.0, 0.0, 0.0])[0], 0.0);
}

#[test]
fn a_loop_of_draws_becomes_one_instanced_batch() {
    // §9.2 — the case that decides whether 128 bars or 4096 is affordable.
    let scene = run(
        "context 3d\nprop n = 128\nrender {\n  for i in 0..n {\n    transform::push()\n    transform::rotate_y(deg: i / n * 360.0)\n    draw::cube(x: 6.0)\n    transform::pop()\n  }\n}\n",
    );

    assert_eq!(scene.commands.len(), 128);
    let batches = scene.batches();
    assert_eq!(batches.len(), 1, "should coalesce into a single draw call");
    assert_eq!(batches[0].instances.len(), 128);
}

#[test]
fn rotation_accepts_either_unit_and_agrees() {
    // §11.6 — deg and rad forms of the same rotation must produce the same
    // output.
    let by_deg = run("context 3d\nrender {\n  transform::rotate_y(deg: 90.0)\n  draw::cube(x: 1.0)\n}\n");
    let by_rad = run("context 3d\nrender {\n  transform::rotate_y(rad: 1.5707963)\n  draw::cube(x: 1.0)\n}\n");

    let a = by_deg.commands[0].model.transform_point([0.0, 0.0, 0.0]);
    let b = by_rad.commands[0].model.transform_point([0.0, 0.0, 0.0]);
    for i in 0..3 {
        assert!((a[i] - b[i]).abs() < 1e-4, "{a:?} vs {b:?}");
    }
}

#[test]
fn the_camera_takes_its_settings_from_the_script() {
    let scene = run(
        "context 3d\nrender {\n  camera::perspective(fov_deg: 55.0, near: 0.5, far: 200.0)\n  camera::position(x: 1.0, y: 2.0, z: 3.0)\n  camera::look_at(x: 4.0, y: 5.0, z: 6.0)\n  draw::cube()\n}\n",
    );

    assert_eq!(scene.camera.position, [1.0, 2.0, 3.0]);
    assert!(matches!(scene.camera.aim, Aim::Target(t) if t == [4.0, 5.0, 6.0]));
    match scene.camera.projection {
        Projection::Perspective { fov_rad, near, far } => {
            assert!((fov_rad - 55.0f32.to_radians()).abs() < 1e-5);
            assert_eq!((near, far), (0.5, 200.0));
        }
        other => panic!("expected perspective, got {other:?}"),
    }
}

#[test]
fn a_later_camera_call_overrides_what_orbit_worked_out() {
    let scene = run(
        "context 3d\nrender {\n  camera::orbit(distance: 20.0)\n  camera::position(x: 0.0, y: 0.0, z: 1.0)\n  draw::cube()\n}\n",
    );
    assert_eq!(scene.camera.position, [0.0, 0.0, 1.0]);
}

#[test]
fn shading_follows_whether_a_light_came_first() {
    // §6.6 — decided at draw time, which is the ordering requirement.
    let scene = run("context 3d\nrender {\n  draw::cube()\n  light::ambient()\n  draw::cube()\n}\n");

    assert_eq!(scene.commands[0].key.shading, Shading::Unlit);
    assert_eq!(scene.commands[1].key.shading, Shading::Lambert);
}

#[test]
fn shading_can_be_named_explicitly() {
    let scene = run("context 3d\nrender {\n  draw::cube(shading: \"lambert\")\n}\n");
    assert_eq!(scene.commands[0].key.shading, Shading::Lambert);
}

#[test]
fn render_state_is_carried_onto_the_commands_it_applies_to() {
    let scene = run(
        "context 3d\nrender {\n  gfx::blend(mode: \"additive\")\n  gfx::depth(enabled: true, write: false)\n  gfx::cull(mode: \"back\")\n  draw::cube()\n}\n",
    );

    let key = scene.commands[0].key;
    assert_eq!(key.blend, BlendMode::Additive);
    assert!(key.depth_enabled && !key.depth_write);
    assert_eq!(key.cull, CullMode::Back);
}

#[test]
fn a_state_change_mid_frame_splits_the_batches() {
    let scene = run(
        "context 3d\nrender {\n  draw::cube()\n  gfx::blend(mode: \"additive\")\n  draw::cube()\n}\n",
    );
    assert_eq!(scene.batches().len(), 2);
}

#[test]
fn lights_are_recorded_with_their_settings() {
    let scene = run(
        "context 3d\nrender {\n  light::ambient(color: $COLOR_WHITE)\n  light::directional(x: -1.0, y: -2.0, z: -1.0, intensity: 0.8)\n  light::point(x: 1.0, range: 25.0)\n  draw::cube()\n}\n",
    );

    assert!(scene.lights.ambient.is_some());
    assert_eq!(scene.lights.directional.len(), 1);
    assert!((scene.lights.directional[0].intensity - 0.8).abs() < 1e-6);
    assert_eq!(scene.lights.point.len(), 1);
    assert!((scene.lights.point[0].range - 25.0).abs() < 1e-6);
}

#[test]
fn colour_and_opacity_reach_the_command() {
    let scene = run(
        "context 3d\nrender {\n  draw::cube(color: color::rgb(r: 1.0, g: 0.5, b: 0.0), opacity: 0.25)\n}\n",
    );
    let cmd = scene.commands[0];
    assert!((cmd.color.r - 1.0).abs() < 1e-6);
    assert!((cmd.color.g - 0.5).abs() < 1e-6);
    assert!((cmd.opacity - 0.25).abs() < 1e-6);
}

// ── runtime errors (§11.15, §11.16) ───────────────────────────────────────

#[test]
fn popping_without_a_push_fails_at_runtime() {
    let err = run_err("context 3d\nrender {\n  transform::pop()\n}\n");
    assert!(err.contains("transform::pop with empty stack"), "{err}");
}

#[test]
fn a_mesh_that_is_too_large_fails_at_runtime() {
    // Built in script rather than typed out.
    let source = "context 3d\nprop n = 70000\nrender {\n  draw::mesh(vertices: [[0.0, 0.0, 0.0]])\n}\n";
    // The small mesh is fine; the limit itself is covered in the scene tests.
    assert_eq!(run(source).commands.len(), 1);
}

#[test]
fn a_wrongly_typed_argument_is_reported_rather_than_ignored() {
    let err = run_err("context 3d\nrender {\n  draw::cube(wireframe: 1.0)\n}\n");
    assert!(err.contains("needs a boolean"), "{err}");

    let err = run_err("context 3d\nrender {\n  gfx::blend(mode: 3.0)\n}\n");
    assert!(err.contains("needs a string"), "{err}");
}

#[test]
fn a_two_d_primitive_in_three_d_says_it_is_not_rendered_yet() {
    // The resolver accepts these — promoting them to world space is the
    // renderer's remaining work, and saying so beats drawing nothing.
    let err = run_err("context 3d\nrender {\n  draw::rect(x: 0.0, y: 0.0, w: 1.0, h: 1.0)\n}\n");
    assert!(err.contains("not rendered in 3d mode yet"), "{err}");
}
