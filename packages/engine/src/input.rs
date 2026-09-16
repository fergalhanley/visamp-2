//! Host-neutral input snapshots and ordered transitions. No DOM access here.
use crate::interpreter::{interpret_event_block, Runtime};
use crate::model::{Block, BlockType, Declarations, FunctionDef, Value};
use serde::Deserialize;
use std::collections::{BTreeMap, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    PointerMove,
    PointerDown,
    PointerUp,
    PointerCancel,
    PointerClick,
    PointerEnter,
    PointerLeave,
    Scroll,
    KeyDown,
    KeyUp,
}
impl EventKind {
    pub fn from_block(name: &str) -> Option<Self> {
        Some(match name {
            "on_input_pointer_move" => Self::PointerMove,
            "on_input_pointer_down" => Self::PointerDown,
            "on_input_pointer_up" => Self::PointerUp,
            "on_input_pointer_cancel" => Self::PointerCancel,
            "on_input_pointer_click" => Self::PointerClick,
            "on_input_pointer_enter" => Self::PointerEnter,
            "on_input_pointer_leave" => Self::PointerLeave,
            "on_input_scroll" => Self::Scroll,
            "on_input_key_down" => Self::KeyDown,
            "on_input_key_up" => Self::KeyUp,
            _ => return None,
        })
    }
    fn is_pointer(self) -> bool {
        !matches!(self, Self::Scroll | Self::KeyDown | Self::KeyUp)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InputEvent {
    pub kind: EventKind,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub inside: bool,
    #[serde(default)]
    pub buttons: u8,
    #[serde(default)]
    pub button: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub repeat: bool,
    #[serde(default)]
    pub delta_x: f64,
    #[serde(default)]
    pub delta_y: f64,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub control: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub meta: bool,
}
impl InputEvent {
    pub fn from_json(json: &str) -> Result<Self, String> {
        if json.len() > 4096 {
            return Err("input packet exceeds 4096 bytes".into());
        }
        let event: Self =
            serde_json::from_str(json).map_err(|e| format!("invalid input packet: {e}"))?;
        if ![event.x, event.y, event.delta_x, event.delta_y]
            .iter()
            .all(|v| v.is_finite())
            || event.buttons > 31
            || event.key.len() > 128
            || event.code.len() > 128
        {
            return Err("invalid input values".into());
        }
        if matches!(
            event.kind,
            EventKind::PointerDown | EventKind::PointerUp | EventKind::PointerClick
        ) {
            button_mask(&event.button)?;
        }
        if matches!(event.kind, EventKind::KeyDown | EventKind::KeyUp)
            && (event.key.is_empty() || event.code.is_empty())
        {
            return Err("keyboard events require key and code".into());
        }
        Ok(event)
    }
}

pub fn button_mask(button: &str) -> Result<u8, String> {
    Ok(match button {
        "primary" => 1, "secondary" => 2, "auxiliary" => 4, "back" => 8, "forward" => 16,
        _ => return Err(format!("unknown pointer button '{button}'; expected primary, secondary, auxiliary, back or forward")),
    })
}

/// The sole signature table, shared by compiler and interpreter.
pub fn signature(path: &str) -> Result<&'static [&'static str], String> {
    Ok(match path {
        "input::pointer::state::get_x"
        | "input::pointer::state::get_y"
        | "input::pointer::state::is_inside"
        | "input::pointer::event::get_x"
        | "input::pointer::event::get_y"
        | "input::pointer::event::get_button"
        | "input::keyboard::event::get_key"
        | "input::keyboard::event::get_code"
        | "input::keyboard::event::is_repeat"
        | "input::scroll::event::get_delta_x"
        | "input::scroll::event::get_delta_y" => &[],
        "input::pointer::state::is_button_down" => &["button"],
        "input::keyboard::state::is_key_down" => &["key"],
        "input::keyboard::state::is_code_down" => &["code"],
        _ => return Err(format!("unknown input function {path}")),
    })
}

pub fn event_available(path: &str, kind: Option<EventKind>) -> bool {
    if !path.contains("::event::") {
        return true;
    }
    match kind {
        Some(k) if path.starts_with("input::pointer::event::") => {
            if path.ends_with("get_button") {
                matches!(
                    k,
                    EventKind::PointerDown | EventKind::PointerUp | EventKind::PointerClick
                )
            } else {
                k.is_pointer()
            }
        }
        Some(EventKind::KeyDown | EventKind::KeyUp) => path.starts_with("input::keyboard::event::"),
        Some(EventKind::Scroll) => path.starts_with("input::scroll::event::"),
        _ => false,
    }
}

#[derive(Clone, Default)]
pub struct InputState {
    pub x: f64,
    pub y: f64,
    pub inside: bool,
    pub buttons: u8,
    keys: BTreeMap<String, String>,
    modifiers: [bool; 4],
    queue: VecDeque<InputEvent>,
    current: Option<InputEvent>,
}
impl InputState {
    pub fn enqueue(&mut self, event: InputEvent) -> Result<(), String> {
        // Coalesce only adjacent moves with identical button/modifier state.
        if let Some(previous) = self.queue.back_mut() {
            if event.kind == EventKind::PointerMove
                && previous.kind == event.kind
                && previous.buttons == event.buttons
                && previous.inside == event.inside
                && (
                    previous.shift,
                    previous.control,
                    previous.alt,
                    previous.meta,
                ) == (event.shift, event.control, event.alt, event.meta)
            {
                *previous = event;
                return Ok(());
            }
        }
        if self.queue.len() >= 256 {
            self.cancel();
            return Err("input queue overflow (256 events); interaction cancelled".into());
        }
        self.queue.push_back(event);
        Ok(())
    }
    pub fn cancel(&mut self) {
        self.queue.clear();
        if self.buttons == 0 && !self.inside && self.keys.is_empty() && self.modifiers == [false; 4]
        {
            return;
        }
        // Deliver cancellation and releases for transitions already seen by scripts.
        let mut cancel = InputEvent::from_json(r#"{"kind":"pointer_cancel"}"#).unwrap();
        cancel.x = self.x;
        cancel.y = self.y;
        self.queue.push_back(cancel);
        for (code, key) in &self.keys {
            let mut up =
                InputEvent::from_json(r#"{"kind":"key_up","key":"reset","code":"reset"}"#).unwrap();
            up.key = key.clone();
            up.code = code.clone();
            self.queue.push_back(up);
        }
    }
    fn apply(&mut self, event: &InputEvent) {
        self.modifiers = [event.shift, event.control, event.alt, event.meta];
        if event.kind.is_pointer() {
            self.x = event.x;
            self.y = event.y;
            self.inside = event.inside;
            self.buttons = event.buttons;
        }
        match event.kind {
            EventKind::PointerCancel => {
                self.buttons = 0;
                self.inside = false;
                self.keys.clear();
                self.modifiers = [false; 4];
            }
            EventKind::KeyDown => {
                if self.keys.len() < 128 || self.keys.contains_key(&event.code) {
                    self.keys.insert(event.code.clone(), event.key.clone());
                }
            }
            EventKind::KeyUp => {
                self.keys.remove(&event.code);
            }
            _ => {}
        }
    }
    pub fn in_handler(&self) -> bool {
        self.current.is_some()
    }
    pub fn read(&self, path: &str, args: &[(String, Value)]) -> Result<Value, String> {
        let labels = signature(path)?;
        if args.len() != labels.len()
            || args
                .iter()
                .zip(labels)
                .any(|((name, _), label)| name != label)
        {
            return Err(format!("{path}: expected arguments {labels:?}"));
        }
        let arg = if let Some((_, value)) = args.first() {
            match value {
                Value::String(s) => s.as_str(),
                _ => return Err(format!("{path}: argument must be a string")),
            }
        } else {
            ""
        };
        if !event_available(path, self.current.as_ref().map(|e| e.kind)) {
            return Err(format!("{path} requires a matching input event handler"));
        }
        Ok(match path {
            "input::pointer::state::get_x" => Value::Float(self.x),
            "input::pointer::state::get_y" => Value::Float(self.y),
            "input::pointer::state::is_inside" => Value::Boolean(self.inside),
            "input::pointer::state::is_button_down" => {
                Value::Boolean(self.buttons & button_mask(arg)? != 0)
            }
            "input::keyboard::state::is_key_down" => Value::Boolean(match arg {
                "Shift" => self.modifiers[0],
                "Control" => self.modifiers[1],
                "Alt" => self.modifiers[2],
                "Meta" => self.modifiers[3],
                _ => self.keys.values().any(|key| key == arg),
            }),
            "input::keyboard::state::is_code_down" => Value::Boolean(self.keys.contains_key(arg)),
            _ => {
                let e = self.current.as_ref().ok_or("missing input event")?;
                match path {
                    "input::pointer::event::get_x" => Value::Float(e.x),
                    "input::pointer::event::get_y" => Value::Float(e.y),
                    "input::pointer::event::get_button" => Value::String(e.button.clone()),
                    "input::keyboard::event::get_key" => Value::String(e.key.clone()),
                    "input::keyboard::event::get_code" => Value::String(e.code.clone()),
                    "input::keyboard::event::is_repeat" => Value::Boolean(e.repeat),
                    "input::scroll::event::get_delta_x" => Value::Float(e.delta_x),
                    "input::scroll::event::get_delta_y" => Value::Float(e.delta_y),
                    _ => unreachable!(),
                }
            }
        })
    }
}

pub fn dispatch(
    blocks: &[Block],
    decels: &mut Declarations,
    runtime: &mut Runtime,
    functions: &[FunctionDef],
) -> Result<(), String> {
    let mut error = None;
    while let Some(event) = runtime.input.queue.pop_front() {
        runtime.input.apply(&event);
        let kind = event.kind;
        runtime.input.current = Some(event);
        if error.is_none() {
            for block in blocks
                .iter()
                .filter(|b| b.block_type == BlockType::Input(kind))
            {
                if let Err(e) = interpret_event_block(block, decels, runtime, functions) {
                    error = Some(e);
                    break;
                }
            }
        }
        // Even a failing handler cannot leave a queued release unapplied.
        runtime.input.current = None;
    }
    error.map_or(Ok(()), Err)
}
