use visamp_2::{
    frame_clock::{Calendar, FrameClock},
    interpreter::{interpret_event_block, Runtime},
    model::{Model, Value},
    parser::build_ast,
};
#[test]
fn snapshot_index_delta_calendar_and_capture_clone() {
    let start = Calendar {
        hour: 23,
        minute: 59,
        day: 6,
        month: 11,
        year: 2026,
    };
    let next = Calendar {
        hour: 0,
        minute: 0,
        day: 0,
        month: 0,
        year: 2027,
    };
    let mut c = FrameClock::new(100.0, start);
    assert_eq!(c.index, 0);
    c.begin_frame(200.0, start);
    assert_eq!(c.index, 0);
    assert_eq!(c.delta_sec, 0.0);
    let captured = c.clone();
    c.begin_frame(216.0, next);
    assert_eq!(c.index, 1);
    assert_eq!(c.delta_sec, 0.016);
    assert_eq!(captured.calendar, start);
    assert_eq!(c.calendar, next);
    c.pause();
    c.begin_frame(10000.0, next);
    assert_eq!(c.index, 2);
    assert_eq!(c.delta_sec, 0.0);
}
#[test]
fn all_system_values_read_the_same_injected_snapshot() {
    let mut rt = Runtime::new();
    rt.frame_count = 900;
    rt.clock = FrameClock::new(
        12345.0,
        Calendar {
            hour: 4,
            minute: 5,
            day: 6,
            month: 0,
            year: 2027,
        },
    );
    let script=build_ast("prop values=[] on_frame { values=[$FRAME_INDEX,$FRAME_COUNT,$TIME_HOUR,$TIME_MINUTE,$TIME_DAY,$TIME_MONTH,$TIME_YEAR,$DELTA_SEC,$TIME_MS,$TIME_SEC] } render {}").unwrap();
    let mut model = Model::from_script(&script);
    interpret_event_block(&model.blocks[0], &mut model.decels, &rt, &model.functions).unwrap();
    assert_eq!(
        model.decels.get("values"),
        Some(&Value::Array(vec![
            Value::Integer(0),
            Value::Integer(900),
            Value::Integer(4),
            Value::Integer(5),
            Value::Integer(6),
            Value::Integer(0),
            Value::Integer(2027),
            Value::Float(0.0),
            Value::Integer(12345),
            Value::Float(12.345)
        ]))
    );
}
