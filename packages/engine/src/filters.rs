//! Ordered, frame-local filter operations. Values retain the Visript 5.x contract.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(i32)]
pub enum Kind {
    Brightness = 1,
    Contrast = 2,
    Saturate = 3,
    Grayscale = 4,
    HueRotate = 5,
    Invert = 6,
    Opacity = 7,
    Sepia = 8,
    Blur = 9,
    Kaleidoscope = 10,
    Swirl = 11,
    PixelateRect = 12,
    PixelateCircle = 13,
    PixelateTriangle = 14,
    PixelatePentagon = 15,
    PixelateHexagon = 16,
    PixelatePentagram = 17,
    PixelateHexagram = 18,
    Mirror = 19,
    Posterize = 20,
    ChromaticAberration = 21,
    Vignette = 22,
    Ripple = 23,
    Scanlines = 24,
    Bloom = 25,
    Displace = 26,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Filter {
    pub kind: Kind,
    pub amount: f32,
    pub params: [f32; 8],
    pub color: [f32; 4],
    pub asset: Option<String>,
}
impl Filter {
    pub fn new(kind: Kind, amount: f32) -> Self {
        Self {
            kind,
            amount,
            params: [0.0; 8],
            color: [0.0; 4],
            asset: None,
        }
    }
}
pub const MAX_FILTERS: usize = 32;
pub fn uses_filters(script: &crate::model::Script) -> bool {
    use crate::model::StatementKind;
    fn has(body: &[crate::model::Statement]) -> bool {
        body.iter().any(|s| match &s.kind {
            StatementKind::FunctionCall(c) => {
                c.namespace == "effect::filter"
                    || (c.namespace == "effect" && c.function != "scramble")
            }
            StatementKind::If(s) => {
                has(&s.then_body) || s.else_body.as_ref().is_some_and(|b| has(b))
            }
            StatementKind::For(s) => has(&s.body),
            StatementKind::While(s) => has(&s.body),
            _ => false,
        })
    }
    script.blocks.iter().any(|b| has(&b.statements))
        || script.functions.iter().any(|f| has(&f.body))
}
