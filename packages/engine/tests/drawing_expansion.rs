use std::cell::RefCell;
use visamp_2::{
    interpreter::{interpret_event_block, interpret_render_block, Runtime, Target},
    model::{BlockType, Model, Value},
    parser::build_ast,
    scene::Scene,
};
fn scene(source: &str) -> Result<Scene, String> {
    let script = build_ast(source)?;
    let mut m = Model::from_script(&script);
    let rt = Runtime::new();
    let scene = RefCell::new(Scene::default());
    for b in &m.blocks {
        if b.block_type == BlockType::Render {
            interpret_render_block(
                b,
                &mut m.decels,
                Target::scene(&scene, &RefCell::new(Vec::new())),
                &rt,
                &m.functions,
            )?;
        }
    }
    Ok(scene.into_inner())
}
fn value(expr: &str) -> Result<Value, String> {
    let script = build_ast(&format!(
        "prop result=0 on_frame {{ result={expr} }} render {{}}"
    ))?;
    let mut m = Model::from_script(&script);
    interpret_event_block(&m.blocks[0], &mut m.decels, &Runtime::new(), &m.functions)?;
    Ok(m.decels.get("result").unwrap().clone())
}
#[test]
fn helpers_have_defined_edges() {
    assert_eq!(
        value("array::length(value: [1,2,3])").unwrap(),
        Value::Integer(3)
    );
    assert_eq!(
        value("array::length(value: audio::detect::get_frequency())").unwrap(),
        Value::Integer(1024)
    );
    assert_eq!(
        value("math::lerp(a: 2,b: 4,amount: 2)").unwrap(),
        Value::Float(6.0)
    );
    assert_eq!(
        value("math::wrap(value: -1,min: 0,max: 5)").unwrap(),
        Value::Float(4.0)
    );
    assert_eq!(
        value("math::smoothstep(value: 0.5,min: 0,max: 1)").unwrap(),
        Value::Float(0.5)
    );
    assert_eq!(value("math::map(value: 3,input_min: 2,input_max: 0,output_min: 0,output_max: 10,clamp: true)").unwrap(),Value::Float(0.0));
    for expr in [
        "math::map(value: 1,input_min: 0,input_max: 0,output_min: 0,output_max: 1)",
        "math::wrap(value: 1,min: 2,max: 0)",
        "math::random(seed: -0.5,index: 0)",
        "math::random(seed: 0,index: 16777216)",
        "math::noise(x: 1000001)",
        "color::radial_gradient(x: 0,y: 0,radius: 0,color_stops: [])",
    ] {
        assert!(value(expr).is_err(), "{expr}");
    }
    let Value::Color(c) = value("color::mix(a: $COLOR_BLACK,b: $COLOR_WHITE,amount: 0.5)").unwrap()
    else {
        panic!()
    };
    assert!((c.r - 0.735356983).abs() < 1e-8);
}
#[test]
fn seeded_vectors_are_stable() {
    use visamp_2::creative_math::{noise, random};
    assert_eq!(random(0, 0), 0.0);
    assert_eq!(random(1, 2), random(1, 2));
    assert_ne!(random(1, 2), random(2, 1));
    assert_eq!(noise(0.0, 0.0, 0.0, 0), 0.0);
    assert!((noise(0.5, -0.5, 0.25, 7) - noise(0.50001, -0.5, 0.25, 7)).abs() < 0.0001);
}
#[test]
fn planar_shapes_and_connected_paths_record_meshes() {
    let s=scene(r#"context 3d render {
 draw::background(color: $COLOR_CORAL)
 draw::polygon(points: [[0,0],[2,0],[2,2],[1,1],[0,2]])
 draw::rect(x: -2,width: 1,height: 1,corner_radius: 0.2)
 draw::circle(radius: 1)
 draw::ellipse(radius_x: 2,radius_y: 1)
 draw::polyline(points: [[0,0,0],[1,0,0],[1,1,1]],stroke_width: 0.1,line_join: "round",line_cap: "round")
 draw::bezier(points: [[0,0,0],[1,2,0],[2,-1,0],[3,0,0]],stroke_width: 0.1)
 draw::arc(radius: 2,sweep_deg: -90,stroke_width: 0.1)
 gfx::overlay(enabled: true)
 transform::push()
 draw::text(content: "screen")
 transform::pop()
 }"#).unwrap();
    assert_eq!(s.commands.len(), 7);
    assert_eq!(s.meshes[0].indices.len(), 9);
    assert_eq!(s.overlay_calls.len(), 3);
    assert!(s.gfx.clear.is_some());
}
#[test]
fn invalid_shapes_and_combinations_fail() {
    for source in [
 "context 3d render {draw::text(content: \"bad\")}",
 "render {draw::arc(radius: 1)}",
 "render {draw::polyline(points: [],line_join: \"miter\")}",
 "context 3d render {draw::circle(gradient: color::linear_gradient())}",
 "context 3d render {draw::sprite(rotation_x_deg: 20)}",
 "context 3d render {gfx::overlay(enabled: true) transform::rotate_x(deg: 1)}",
 "context 3d render {draw::background(texture: asset::bitmap(id: \"x\"))}",
 "render {transform::translate(z: 1)}",
 "context 3d render {draw::polygon(points: [[0,0],[1,1],[0,1],[1,0]])}",
 "context 3d render {draw::polyline(points: [[0,0],[1,1]])}",
 "context 3d render {gfx::overlay(enabled: true) draw::text(content: \"a\") gfx::overlay(enabled: false) draw::cube()}"
 ]{assert!(scene(source).is_err(),"{source}");}
}

#[test]
fn integer_arguments_floor_fractional_values() {
    assert_eq!(
        value("array::length(value: array::filled(count: 3.9, value: 0))").unwrap(),
        Value::Integer(3)
    );
    assert_eq!(
        value("math::random(seed: 3.9, index: 2.9)").unwrap(),
        value("math::random(seed: 3, index: 2)").unwrap()
    );
    assert_eq!(
        value("math::noise(x: 0.1, seed: 3.9)").unwrap(),
        value("math::noise(x: 0.1, seed: 3)").unwrap()
    );
    let s = scene(
        "context 3d render { draw::point_cloud(count: 3.9) draw::grid(columns: 2.9, rows: 3.9) }",
    )
    .unwrap();
    assert_eq!(s.point_clouds[0].count, 3);
    assert_eq!(s.point_clouds[1].grid, Some((2, 3)));
    for v in [
        Value::Float(f64::NAN),
        Value::Float(f64::INFINITY),
        Value::Float(9223372036854775808.0),
        Value::Boolean(true),
    ] {
        assert!(v.floor_integer("test").is_err());
    }
    assert_eq!(Value::Float(-0.2).floor_integer("test").unwrap(), -1);
    assert_eq!(
        Value::Integer(i64::MAX).floor_integer("test").unwrap(),
        i64::MAX
    );
    assert!(value("array::filled(count: -0.2, value: 0)").is_err());
}
