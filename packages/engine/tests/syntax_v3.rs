use std::cell::RefCell;
use visamp_2::{
    interpreter::{interpret_render_block, Runtime, Target},
    model::{BlockType, Model},
    parser::build_ast,
    scene::Scene,
    source_migration::migrate,
};

fn scene(source: &str) -> Scene {
    let script = build_ast(source).unwrap();
    let mut model = Model::from_script(&script);
    let scene = RefCell::new(Scene::default());
    for block in &model.blocks {
        if block.block_type == BlockType::Render {
            interpret_render_block(
                block,
                &mut model.decels,
                Target::scene(&scene, &RefCell::new(String::new())),
                &Runtime::new(),
                &model.functions,
            )
            .unwrap();
        }
    }
    scene.into_inner()
}

#[test]
fn alpha_defaults_clamps_and_matches_migrated_transparency() {
    for kind in ["rgb", "hsl"] {
        for (arg, expected) in [
            ("", 1.0),
            ("a: 0", 0.0),
            ("a: 0.25", 0.25),
            ("a: -2", 0.0),
            ("a: 3", 1.0),
        ] {
            let source = format!("context 3d render {{ draw::cube(color: color::{kind}({arg})) }}");
            assert_eq!(scene(&source).commands[0].color.a, expected);
        }
        for value in ["0", "1", "0.75", "-2", "3", "math::sin(radians: 0.5)"] {
            let source = format!(
                "context 3d render {{ draw::cube(color: color::{kind}(transparent: {value})) }}"
            );
            let new = migrate(&source).unwrap();
            assert!(build_ast(&source).is_err());
            let expected = match value {
                "0" | "-2" => 1.0,
                "1" | "3" => 0.0,
                "0.75" => 0.25,
                _ => 1.0 - 0.5_f64.sin(),
            };
            assert!((scene(&new).commands[0].color.a - expected).abs() < 1e-12);
        }
    }
}

#[test]
fn migration_preserves_non_builtin_text_and_is_idempotent() {
    let source = r#"// transparent: 0.9, radians: 2
fn helper(transparent: 0.5) { return transparent }
render {
 draw::text(text: "transparent: 0.9")
 draw::rect(w: 10, h: 20, rotate: math::sin(radians: 2), stroke_weight: 3,
 color: color::rgb(transparent: helper(transparent: 0.25)))
}"#;
    let new = migrate(source).unwrap();
    assert!(new.contains("// transparent: 0.9, radians: 2"));
    assert!(new.contains("fn helper(transparent: 0.5)"));
    assert!(new.contains("helper(transparent: 0.25)"));
    assert!(new.contains("content: \"transparent: 0.9\""));
    assert!(new.contains("rotation_rad: math::sin(rad: 2)"));
    assert!(new.contains("a: 1.0 - (helper"));
    assert_eq!(migrate(&new).unwrap(), new);
    assert!(migrate("render { draw::rect(w: 1, width: 2) }").is_err());
    let comment = "render { draw::background(color: color::rgb(transparent: 0.5 // keep\n)) }";
    assert!(migrate(comment).is_ok());
}

#[test]
fn removed_names_are_rejected_and_rotation_units_conflict() {
    for call in [
        "draw::rect(w: 1)",
        "draw::ellipse(rx: 1)",
        "draw::text(text: \"old\")",
        "draw::rect(rotate: 1)",
        "draw::line(stroke_weight: 1)",
        "draw::cube(rot_x: 1)",
        "draw::torus(tube: 1)",
        "draw::background(color: color::rgb(transparent: 0.5))",
        "draw::rect(rotation_rad: 1, rotation_deg: 1)",
        "draw::cube(rotation_x_rad: 1, rotation_x_deg: 1)",
        "draw::background(color: color::rgb(a: 0, a: 1))",
    ] {
        assert!(
            build_ast(&format!("context 3d render {{ {call} }}")).is_err(),
            "{call}"
        );
    }
    assert!(build_ast("render { let x = math::sin(radians: 1) }").is_err());
    assert!(build_ast("render { draw::rect(rotation_deg: 30) draw::ellipse(radius_x: 2, radius_y: 1, rotation_rad: 0.5) }").is_ok());
}

#[test]
fn full_dimensions_and_rotation_units_record_equivalent_geometry() {
    let a = scene(
        "context 3d render { draw::cube(width: 2, height: 4, depth: 6, rotation_x_deg: 90) }",
    );
    let b = scene(
        "context 3d render { draw::cube(width: 2, height: 4, depth: 6, rotation_x_rad: $PI / 2) }",
    );
    assert_eq!(a.commands[0].model, b.commands[0].model);
}

#[test]
fn dependent_gpu_alpha_and_math_compile_for_points_and_grids() {
    for draw in [
        "draw::point_cloud(count: 2",
        "draw::grid(columns: 2, rows: 2",
    ] {
        for kind in ["rgb", "hsl"] {
            let source = format!("context 3d render {{ {draw}, color: color::{kind}(a: 1.0 - math::sin(rad: $POINT_INDEX))) }}");
            let s = scene(&source);
            assert!(s.point_clouds[0].body.contains("sin("));
            assert!(s.point_clouds[0].body.contains("gl_VertexID"));
        }
    }
}
