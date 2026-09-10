//! Scramble's shared DSL contract and the original byte-addressed presets.
use crate::model::{Color, Script, Statement, BLACK};

pub const MAX_TYPE: i64 = 40;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Scramble {
    pub kind: u8,
    pub refresh: Color,
}

impl Default for Scramble {
    fn default() -> Self {
        Self {
            kind: 1,
            refresh: BLACK,
        }
    }
}

/// RGBA byte offsets, followed by the number of rows excluded at the bottom.
/// These are NOT pixel offsets or iteration counts. Types remain 1-based.
pub const PRESETS: [[i32; 5]; 17] = [
    [-100, 100, 0, 3, 24],
    [4, 1, -2, 3, 1],
    [4, 5, 6, 7, 1],
    [6, 4, 5, 7, 1],
    [2, 0, 1, 3, 1],
    [55, 1, 77, 36, 20],
    [20, 21, 22, 23, 11],
    [-23, -22, -21, -20, 1],
    [-24, -23, -22, -21, 1],
    [20, 1, -22, 3, 5],
    [4, 21, -22, 3, 5],
    [27, -29, 44, 2, 12],
    [-9, -36, 11, 20, 12],
    [32, 48, -40, 43, 12],
    [-47, 22, 19, 26, 12],
    [-72, -33, -5, -100, 12],
    [49, -88, 52, 31, 12],
];

/// Run refresh at the original 60 Hz cadence. Retaining the fractional tick
/// avoids making 8-bit Canvas rounding happen twice as often at 120 FPS.
/// Repeating source-over n times is the quantized counterpart of
/// effective_alpha = 1 - (1 - alpha)^n. Displacement still runs every frame.
pub fn refresh_steps(remainder: &mut f64, seconds: f64) -> u32 {
    let ticks = *remainder + seconds.max(0.0) * 60.0;
    let whole = (ticks + 1e-8).floor();
    *remainder = (ticks - whole).max(0.0);
    // A monotonic 8-bit source-over transition reaches a fixed point within
    // 256 steps. A long background-tab pause therefore never needs more.
    whole.min(256.0) as u32
}

/// Only widths below 27 can read bytes already written by the original loop.
/// Resolve that dependency once (on resize/preset change), never by reading
/// pixels back from the GPU. -1 represents an out-of-bounds typed-array read.
pub fn narrow_source_map(width: u32, height: u32, kind: u8) -> Vec<i32> {
    let length = (width * height * 4) as i32;
    let mut map: Vec<i32> = (0..length).collect();
    let p = PRESETS[kind as usize - 1];
    let w = width as i32 * 4 - 4;
    let end = length - width as i32 * 4 * p[4];
    for i in (w..end).step_by(4) {
        for c in 0..4 {
            let source = i + w + p[c];
            map[i as usize + c] = if (0..length).contains(&source) {
                map[source as usize]
            } else {
                -1
            };
        }
    }
    map
}

/// Choose the backend before drawing starts, including conditional calls and
/// calls inside user functions. Unused functions may opt in, but never execute.
pub fn uses_scramble(script: &Script) -> bool {
    fn has(statements: &[Statement]) -> bool {
        statements.iter().any(|s| match s {
            Statement::FunctionCall(c) => c.namespace == "effect" && c.function == "scramble",
            Statement::If(s) => has(&s.then_body) || s.else_body.as_ref().is_some_and(|b| has(b)),
            Statement::For(s) => has(&s.body),
            Statement::While(s) => has(&s.body),
            _ => false,
        })
    }
    script.blocks.iter().any(|b| has(&b.statements))
        || script.functions.iter().any(|f| has(&f.body))
}
