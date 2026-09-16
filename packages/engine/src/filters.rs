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
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Filter {
    pub kind: Kind,
    pub amount: f32,
}
pub const MAX_FILTERS: usize = 32;
pub fn uses_filters(script: &crate::model::Script) -> bool {
    use crate::model::StatementKind;
    fn has(body: &[crate::model::Statement]) -> bool {
        body.iter().any(|s| match &s.kind {
            StatementKind::FunctionCall(c) => c.namespace == "effect::filter",
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
