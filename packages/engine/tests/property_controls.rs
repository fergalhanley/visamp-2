use visamp_2::interpreter::{interpret_event_block, Runtime};
use visamp_2::model::{BlockType, Color, Model, Value};
use visamp_2::parser::build_ast;

fn model() -> Model {
    let script = build_ast(
        r#"
        param GAIN = 0.5
        param COUNT = 3
        param ENABLED = true
        param LABEL = "hello"
        param TINT = $COLOR_RED
        prop phase = 0.0

        render {}
        "#,
    )
    .expect("valid script");
    Model::from_script(&script)
}

#[test]
fn host_can_update_supported_param_types() {
    let mut model = model();

    model.set_param_json("GAIN", "0.75").unwrap();
    model.set_param_json("COUNT", "8").unwrap();
    model.set_param_json("ENABLED", "false").unwrap();
    model.set_param_json("LABEL", r#""world""#).unwrap();
    model.set_param_json("TINT", r##""#336699""##).unwrap();

    assert_eq!(model.decels.global("GAIN"), Some(&Value::Float(0.75)));
    assert_eq!(model.decels.global("COUNT"), Some(&Value::Integer(8)));
    assert_eq!(model.decels.global("ENABLED"), Some(&Value::Boolean(false)));
    assert_eq!(
        model.decels.global("LABEL"),
        Some(&Value::String("world".to_string()))
    );

    match model.decels.global("TINT") {
        Some(Value::Color(Color { r, g, b, a })) => {
            assert!((*r - 0.2).abs() < 0.001);
            assert!((*g - 0.4).abs() < 0.001);
            assert!((*b - 0.6).abs() < 0.001);
            assert!((*a - 1.0).abs() < f64::EPSILON);
        }
        other => panic!("expected colour, got {other:?}"),
    }
}

#[test]
fn host_cannot_set_a_prop_through_param_api() {
    let mut model = model();
    let error = model.set_param_json("phase", "1.0").unwrap_err();

    assert!(error.contains("Unknown param"));
    assert_eq!(model.decels.global("phase"), Some(&Value::Float(0.0)));
}

#[test]
fn rejected_param_value_leaves_param_unchanged() {
    let mut model = model();
    let error = model.set_param_json("GAIN", r#""loud""#).unwrap_err();

    assert!(error.contains("finite number"));
    assert_eq!(model.decels.global("GAIN"), Some(&Value::Float(0.5)));
}

#[test]
fn params_are_immutable_inside_visript() {
    let script = build_ast(
        r#"
        param GAIN = 0.5
        on_frame {
          GAIN = 0.9
        }
        render {}
        "#,
    )
    .expect("syntax is valid; immutability is a runtime language rule");
    let mut model = Model::from_script(&script);
    let block = model
        .blocks
        .iter()
        .find(|block| block.block_type == BlockType::OnFrame)
        .unwrap()
        .clone();

    let error = interpret_event_block(
        &block,
        &mut model.decels,
        &Runtime::new(),
        &model.functions,
    )
    .unwrap_err();

    assert!(error.contains("Param 'GAIN' is immutable"));
    assert_eq!(model.decels.global("GAIN"), Some(&Value::Float(0.5)));
}

#[test]
fn param_names_must_be_upper_snake_case() {
    let error = build_ast(
        r#"
        param gain = 0.5
        render {}
        "#,
    )
    .unwrap_err();

    assert!(error.contains("UPPER_SNAKE_CASE"));
}

#[test]
fn colour_param_can_supply_alpha() {
    let mut model = model();

    model.set_param_json("TINT", r##""#ff000080""##).unwrap();

    match model.decels.global("TINT") {
        Some(Value::Color(Color { a, .. })) => {
            assert!((*a - 128.0 / 255.0).abs() < 0.001);
        }
        other => panic!("expected colour, got {other:?}"),
    }
}
