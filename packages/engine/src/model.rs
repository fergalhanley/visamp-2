use std::collections::HashMap;

/// Color represented as RGBA floats (0.0-1.0)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Color {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl Color {
    pub fn new(r: f64, g: f64, b: f64, a: f64) -> Self {
        Color { r, g, b, a }
    }

    pub fn to_css(&self) -> String {
        format!(
            "rgba({},{},{},{})",
            (self.r * 255.0) as u8,
            (self.g * 255.0) as u8,
            (self.b * 255.0) as u8,
            self.a
        )
    }
}

// Predefined colors
pub const BLACK: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
pub const WHITE: Color = Color { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
pub const RED: Color = Color { r: 1.0, g: 0.0, b: 0.0, a: 1.0 };
pub const GREEN: Color = Color { r: 0.0, g: 1.0, b: 0.0, a: 1.0 };
pub const BLUE: Color = Color { r: 0.0, g: 0.0, b: 1.0, a: 1.0 };

// Extended palette (32 colors)
pub const ORANGE: Color = Color { r: 1.0, g: 0.647, b: 0.0, a: 1.0 };
pub const YELLOW: Color = Color { r: 1.0, g: 1.0, b: 0.0, a: 1.0 };
pub const PINK: Color = Color { r: 1.0, g: 0.753, b: 0.796, a: 1.0 };
pub const MAGENTA: Color = Color { r: 1.0, g: 0.0, b: 1.0, a: 1.0 };
pub const CYAN: Color = Color { r: 0.0, g: 1.0, b: 1.0, a: 1.0 };
pub const TEAL: Color = Color { r: 0.0, g: 0.502, b: 0.502, a: 1.0 };
pub const TURQUOISE: Color = Color { r: 0.251, g: 0.878, b: 0.816, a: 1.0 };
pub const NAVY: Color = Color { r: 0.0, g: 0.0, b: 0.502, a: 1.0 };
pub const INDIGO: Color = Color { r: 0.294, g: 0.0, b: 0.51, a: 1.0 };
pub const VIOLET: Color = Color { r: 0.933, g: 0.51, b: 0.933, a: 1.0 };
pub const PURPLE: Color = Color { r: 0.502, g: 0.0, b: 0.502, a: 1.0 };
pub const LAVENDER: Color = Color { r: 0.902, g: 0.902, b: 0.98, a: 1.0 };
pub const BROWN: Color = Color { r: 0.647, g: 0.165, b: 0.165, a: 1.0 };
pub const MAROON: Color = Color { r: 0.502, g: 0.0, b: 0.0, a: 1.0 };
pub const OLIVE: Color = Color { r: 0.502, g: 0.502, b: 0.0, a: 1.0 };
pub const FOREST_GREEN: Color = Color { r: 0.133, g: 0.545, b: 0.133, a: 1.0 };
pub const GOLD: Color = Color { r: 1.0, g: 0.843, b: 0.0, a: 1.0 };
pub const SILVER: Color = Color { r: 0.753, g: 0.753, b: 0.753, a: 1.0 };
pub const GRAY: Color = Color { r: 0.502, g: 0.502, b: 0.502, a: 1.0 };
pub const DARK_GRAY: Color = Color { r: 0.333, g: 0.333, b: 0.333, a: 1.0 };
pub const LIGHT_GRAY: Color = Color { r: 0.827, g: 0.827, b: 0.827, a: 1.0 };
pub const CRIMSON: Color = Color { r: 0.863, g: 0.078, b: 0.235, a: 1.0 };
pub const CORAL: Color = Color { r: 1.0, g: 0.498, b: 0.314, a: 1.0 };
pub const SALMON: Color = Color { r: 0.98, g: 0.502, b: 0.447, a: 1.0 };
pub const SAND: Color = Color { r: 0.957, g: 0.894, b: 0.702, a: 1.0 };
pub const BEIGE: Color = Color { r: 0.961, g: 0.961, b: 0.863, a: 1.0 };
pub const SKY_BLUE: Color = Color { r: 0.529, g: 0.808, b: 0.922, a: 1.0 };
pub const AMBER: Color = Color { r: 1.0, g: 0.749, b: 0.0, a: 1.0 };
pub const LIME: Color = Color { r: 0.753, g: 1.0, b: 0.0, a: 1.0 };
pub const CHARTREUSE: Color = Color { r: 0.498, g: 1.0, b: 0.0, a: 1.0 };
pub const TAN: Color = Color { r: 0.824, g: 0.706, b: 0.549, a: 1.0 };

/// 2D point
#[derive(Debug, Clone, Copy)]
pub struct Point2 {
    pub x: f64,
    pub y: f64,
}

impl Point2 {
    pub fn new(x: f64, y: f64) -> Self {
        Point2 { x, y }
    }
}

/// Runtime value in the DSL
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Boolean(bool),
    Integer(i64),
    Float(f64),
    String(String),
    Array(Vec<Value>),
    Identifier(String),
    SystemValue(String),
    Color(Color),
}

impl Value {
    /// A short, stable type tag for the properties inspector.
    pub fn type_tag(&self) -> &'static str {
        match self {
            Value::Boolean(_) => "boolean",
            Value::Integer(_) => "integer",
            Value::Float(_) => "float",
            Value::String(_) => "string",
            Value::Array(_) => "array",
            Value::Identifier(_) => "identifier",
            Value::SystemValue(_) => "system",
            Value::Color(_) => "color",
        }
    }

    /// How the value reads in the properties inspector.
    ///
    /// Deliberately a string rather than a number: a float property can hold
    /// NaN or infinity, neither of which is representable in JSON, and a
    /// value updating every frame is unreadable at full float precision.
    pub fn display(&self) -> String {
        match self {
            Value::Boolean(b) => b.to_string(),
            Value::Integer(i) => i.to_string(),
            Value::Float(f) => format_float(*f),
            Value::String(s) => format!("\"{}\"", s),
            Value::Identifier(name) => name.clone(),
            Value::SystemValue(name) => format!("${}", name),
            Value::Color(c) => format!(
                "rgba({}, {}, {}, {})",
                format_float(c.r),
                format_float(c.g),
                format_float(c.b),
                format_float(c.a)
            ),
            Value::Array(items) => {
                // A spectrum snapshot is 1024 entries; showing them all would
                // bury every other property in the panel.
                const SHOWN: usize = 8;
                let head = items
                    .iter()
                    .take(SHOWN)
                    .map(|v| v.display())
                    .collect::<Vec<_>>()
                    .join(", ");
                if items.len() > SHOWN {
                    format!("[{}, … {} items]", head, items.len())
                } else {
                    format!("[{}]", head)
                }
            }
        }
    }

    /// Fallible colour conversion.
    ///
    /// The panicking form this replaced took the whole engine with it: wasm
    /// has no unwinding, so a panic aborts mid-frame with the model and
    /// runtime `RefCell`s still borrowed, and every later frame then fails to
    /// borrow them. One mistyped argument permanently froze the canvas until
    /// the page was reloaded. Reporting it leaves the previous frame on screen
    /// and puts the reason in the log.
    pub fn try_into_color(self) -> Result<Color, String> {
        match self {
            Value::Color(c) => Ok(c),
            other => Err(format!("Expected a color, got {}", other.type_tag())),
        }
    }

    /// Fallible number conversion; see `try_into_color` for why it is fallible.
    pub fn try_into_f64(self) -> Result<f64, String> {
        match self {
            Value::Float(f) => Ok(f),
            Value::Integer(i) => Ok(i as f64),
            other => Err(format!("Expected a number, got {}", other.type_tag())),
        }
    }

    pub fn into_f64(self) -> f64 {
        match self {
            Value::Float(f) => f,
            Value::Integer(i) => i as f64,
            other => panic!("Expected number, got {:?}", other),
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Float(f) => Some(*f),
            Value::Integer(i) => Some(*i as f64),
            _ => None,
        }
    }
}

/// Trims a float to something readable in a panel that updates every frame,
/// without printing `NaN`/`inf` as if they were ordinary numbers.
pub fn format_float(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "∞".to_string() } else { "-∞".to_string() };
    }
    let rounded = format!("{:.3}", value);
    // `0.500` reads worse than `0.5`, but `0.000` must stay `0`.
    let trimmed = rounded.trim_end_matches('0').trim_end_matches('.');
    if trimmed.is_empty() || trimmed == "-" {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Scoped variable storage
#[derive(Debug, Clone)]
pub struct Declarations {
    pub scopes: Vec<HashMap<String, Value>>,
}

impl Declarations {
    pub fn new() -> Self {
        Declarations { scopes: Vec::new() }
    }

    pub fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    pub fn pop_scope(&mut self) {
        self.scopes.pop().expect("popped too many scopes");
    }

    pub fn declare(&mut self, name: String, value: Value) {
        let current = self.scopes.last_mut().unwrap();
        current.insert(name, value);
    }

    pub fn get(&self, name: &str) -> Option<&Value> {
        for scope in self.scopes.iter().rev() {
            if let Some(v) = scope.get(name) {
                return Some(v);
            }
        }
        None
    }

    pub fn set(&mut self, name: &str, value: Value) {
        for scope in self.scopes.iter_mut().rev() {
            if let Some(existing) = scope.get_mut(name) {
                *existing = value;
                return;
            }
        }
        panic!("attempted to set undeclared variable `{}`", name);
    }

    pub fn contains(&self, name: &str) -> bool {
        for scope in self.scopes.iter().rev() {
            if scope.contains_key(name) {
                return true;
            }
        }
        false
    }
}

// ── AST Types ──

/// The coordinate model a script draws in.
///
/// This is the author's whole choice. Which canvas backend it runs on — the 2d
/// context or WebGL2 — is the engine's decision.
///
/// A canvas keeps whichever backend it was first given for its lifetime, so
/// this is read once when the engine binds to the canvas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ContextKind {
    #[default]
    TwoD,
    ThreeD,
}

impl ContextKind {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "2d" => Some(ContextKind::TwoD),
            "3d" => Some(ContextKind::ThreeD),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ContextKind::TwoD => "2d",
            ContextKind::ThreeD => "3d",
        }
    }

    /// The backend the engine asks the canvas for.
    pub fn canvas_context(&self) -> &'static str {
        match self {
            ContextKind::TwoD => "2d",
            ContextKind::ThreeD => "webgl2",
        }
    }

}

#[derive(Debug, Clone)]
pub struct Script {
    pub context: ContextKind,
    pub props: Vec<PropertyDef>,
    pub functions: Vec<FunctionDef>,
    pub blocks: Vec<Block>,
}

impl Script {
    pub fn new() -> Self {
        Script {
            context: ContextKind::default(),
            props: Vec::new(),
            functions: Vec::new(),
            blocks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Block {
    pub block_type: BlockType,
    pub statements: Vec<Statement>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Render,
    OnFrame,
}

#[derive(Debug, Clone)]
pub enum Statement {
    LetDecl(LetDecl),
    FunctionCall(FunctionCall),
    /// A user-defined function called as a statement, for its drawing rather
    /// than its return value.
    Call(Expression),
    Assignment(Assignment),
    If(IfStatement),
    For(ForLoop),
    While(WhileLoop),
    Return(ReturnStatement),
}

#[derive(Debug, Clone)]
pub struct ReturnStatement {
    pub expression: Expression,
}

#[derive(Debug, Clone)]
pub struct FunctionDef {
    pub name: String,
    pub params: Vec<ParamDef>,
    pub body: Vec<Statement>,
}

#[derive(Debug, Clone)]
pub struct ParamDef {
    pub name: String,
    pub default: Expression,
}

#[derive(Debug, Clone)]
pub struct IfStatement {
    pub condition: Expression,
    pub then_body: Vec<Statement>,
    pub else_body: Option<Vec<Statement>>,
}

#[derive(Debug, Clone)]
pub struct ForLoop {
    pub variable: String,
    pub iterable: ForIterable,
    pub body: Vec<Statement>,
}

/// What a `for` walks over: an array value, or a numeric range.
#[derive(Debug, Clone)]
pub enum ForIterable {
    Expression(Expression),
    /// `start..end`, `start..=end`, optionally `step n`. Integers only.
    Range {
        start: Expression,
        end: Expression,
        /// True for `..=`.
        inclusive: bool,
        /// Defaults to 1. A descending range needs an explicit negative step,
        /// so `5..0` is empty rather than silently counting backwards.
        step: Option<Expression>,
    },
}

#[derive(Debug, Clone)]
pub struct WhileLoop {
    pub condition: Expression,
    pub body: Vec<Statement>,
}

#[derive(Debug, Clone)]
pub struct PropertyDef {
    pub name: String,
    pub value: Value,
}

#[derive(Debug, Clone)]
pub struct Argument {
    pub name: String,
    pub expression: Expression,
}

#[derive(Debug, Clone)]
pub struct Assignment {
    pub ident: String,
    pub expression: Expression,
}

#[derive(Debug, Clone)]
pub struct LetDecl {
    pub ident: String,
    pub expression: Expression,
}

#[derive(Debug, Clone)]
pub struct FunctionCall {
    pub namespace: String,
    pub function: String,
    pub args: Vec<Argument>,
}

#[derive(Debug, Clone)]
pub enum Expression {
    Literal(Literal),
    Identifier(String),
    SystemValue(String),
    Array(Vec<Expression>),
    Grouping(Box<Expression>),
    /// `target[index]`. Reading out of range yields 0 rather than failing —
    /// the audio arrays are empty whenever nothing is playing, and every
    /// visualisation has to keep working in silence.
    Index {
        target: Box<Expression>,
        index: Box<Expression>,
    },
    Unary {
        op: UnaryOperator,
        expr: Box<Expression>,
    },
    Binary {
        left: Box<Expression>,
        op: BinaryOperator,
        right: Box<Expression>,
    },
    Call {
        name: String,
        args: Vec<(String, Expression)>,
    },
    ColorConstruct {
        kind: ColorConstructKind,
        args: Vec<(String, Expression)>,
    },
    MathCall {
        func: String,
        args: Vec<(String, Expression)>,
    },
}

#[derive(Debug, Clone)]
pub enum ColorConstructKind {
    Rgb,
    Hsl,
}

#[derive(Debug, Clone)]
pub enum Literal {
    Boolean(bool),
    Integer(i64),
    Float(f64),
    String(String),
}

#[derive(Debug, Clone)]
pub enum UnaryOperator {
    Not,
    Negate,
    Plus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BinaryOperator {
    Add,
    Subtract,
    Multiply,
    Divide,
    /// `\` — truncating division, always yields an integer.
    IntegerDivide,
    Modulus,
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    /// `&&` and `||` — booleans only, and short-circuiting.
    And,
    Or,
    /// `&`, `|`, `^` — integers only.
    BitAnd,
    BitOr,
    BitXor,
}

/// The runtime model holding state and blocks
#[derive(Debug, Clone)]
pub struct Model {
    pub context: ContextKind,
    pub decels: Declarations,
    pub functions: Vec<FunctionDef>,
    pub blocks: Vec<Block>,
    /// Property names in the order they were declared. The scope itself is a
    /// `HashMap`, so this is the only record of the author's ordering — the
    /// inspector lists them as written rather than in hash order.
    pub prop_names: Vec<String>,
}

impl Model {
    pub fn from_script(script: &Script) -> Self {
        let mut decels = Declarations::new();
        decels.push_scope();
        // `prop tint = $COLOR_CRIMSON` parses to the bare token, so resolve
        // system values here rather than leaving a name that every later use
        // has to cope with. Constants like the palette and PI come out exact;
        // frame-varying ones (`$WIDTH`, `$TIME_MS`) resolve against a fresh
        // runtime, which is the right reading of an *initial* value.
        let seed = crate::interpreter::Runtime::new();

        let mut prop_names = Vec::with_capacity(script.props.len());
        for prop in &script.props {
            let value = match &prop.value {
                Value::SystemValue(name) => {
                    crate::interpreter::map_value_runtime(name.trim_start_matches('$'), &seed)
                        .unwrap_or_else(|_| prop.value.clone())
                }
                other => other.clone(),
            };
            decels.declare(prop.name.clone(), value);
            // A redeclared name keeps its first position rather than appearing
            // twice in the inspector.
            if !prop_names.contains(&prop.name) {
                prop_names.push(prop.name.clone());
            }
        }
        Model {
            context: script.context,
            decels,
            functions: script.functions.clone(),
            blocks: script.blocks.clone(),
            prop_names,
        }
    }
}
