#![crate_type = "cdylib"]

use std::cell::RefCell;

use nannou::wgpu::{Backends, DeviceDescriptor, Limits};

use pest::Parser;
use pest::iterators::Pair;
use pest_derive::Parser;
use std::collections::HashMap;
use nannou::prelude::*;

#[cfg(target_arch = "wasm32")]
use js_sys::Date;

#[cfg(not(target_arch = "wasm32"))]
use std::time::{SystemTime, UNIX_EPOCH};

// Derive our parser from the grammar in "visamp_dsl.pest"
#[derive(Parser)]
#[grammar = "visamp_dsl.pest"] // This path is relative to src/
pub struct VisampDSLParser;

// Define the AST

#[derive(Debug, Clone)]
pub struct Script {
    pub props: Vec<PropertyDef>,
    pub blocks: Vec<Block>,
}

impl Script {
    pub fn new() -> Self {
        Script {
            props: Vec::new(),
            blocks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Block {
    pub block_type: BlockType,
    pub statements: Vec<Statement>,
}

#[derive(Debug, Clone)]
pub enum BlockType {
    Layer2D,
    OnFrame,
}

#[derive(Debug, Clone)]
pub enum Statement {
    LetDecl(LetDecl),
    FunctionCall(FunctionCall),
    Assignment(Assignment),
}

#[derive(Debug, Clone)]
pub struct PropertyDef {
    pub name: String,
    pub value: Value,
}

#[derive(Debug, Clone)]
pub struct Property {
    pub name: String,
    pub expression: Expression,
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

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Boolean(bool),
    Integer(i64),
    Time(u128),
    Float(f64),
    String(String),
    Array(Vec<Value>),
    Identifier(String),
    SystemValue(String),
    Color(Srgb<u8>),
}

impl Value {
    /// Turn a `Value::Color(Srgb<u8>)` into an `Srgba<f32>` for nannou.
    pub fn into_srgba_f32(self) -> Srgba {
        match self {
            Value::Color(c8) => {
                let Srgb { red, green, blue, standard } = c8.into_format();
                Srgba::new(red, green, blue, 1.0)
            }
            other => panic!("Expected Color, got {:?}", other),
        }
    }

    pub fn into_f32(self) -> f32 {
        match self {
            Value::Float(f_val) => f_val as f32,
            Value::Integer(i_val) => i_val as f32,
            other => panic!("Expected Color, got {:?}", other),
        }
    }
}

#[derive(Debug, Clone)]
pub enum Expression {
    /// Represents a literal value, such as a boolean, number, or string.
    Literal(Literal),
    /// An identifier (variable name).
    Identifier(String),
    /// A system value, such as `$HEIGHT`.
    SystemValue(String),
    /// An array literal.
    Array(Vec<Expression>),
    /// A grouping expression, for handling parenthesized expressions.
    Grouping(Box<Expression>),
    /// A unary operation (e.g., `-expr` or `!expr`).
    Unary {
        op: UnaryOperator,
        expr: Box<Expression>,
    },
    /// A binary operation (e.g., `expr + expr`, `expr * expr`).
    Binary {
        left: Box<Expression>,
        op: BinaryOperator,
        right: Box<Expression>,
    },
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
    /// Logical NOT (`!`) or negation (`-`).
    Not,
    Negate,
    /// Unary plus (e.g., `+expr`), which is sometimes supported.
    Plus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BinaryOperator {
    Add,           // +
    Subtract,      // -
    Multiply,      // *
    Divide,        // /
    Modulus,       // %
    Equal,         // ==
    NotEqual,      // !=
    LessThan,      // <
    LessThanOrEqual,  // <=
    GreaterThan,   // >
    GreaterThanOrEqual, // >=
}

// #[wasm_bindgen]
// pub async fn run(script: &str, _canvas_id: &str) {
//     // Collect command-line arguments
//     // let args: Vec<String> = env::args().collect();

//     // Check if the user provided the DSL file path
//     // if args.len() < 2 {
//     //     eprintln!("Usage: {} <dsl_file>", args[0]);
//     //     std::process::exit(1);
//     // }

//     // let filename = &args[1];

//     // // Read the DSL file into a string
//     // let dsl_source = fs::read_to_string(filename).unwrap_or_else(|err| {
//     //     eprintln!("Error reading file {}: {}", filename, err);
//     //     std::process::exit(1);
//     // });

//     // Parse the DSL source starting from the "script" rule.
//     let parse_result = VisampDSLParser::parse(Rule::script, script)
//         .expect("Failed to parse script")
//         .next()
//         .unwrap();

//     // println!("{:#?}", parse_result);

//     let ast = build_ast(parse_result);

//     // interpret(ast);
// }

pub async fn run_app() {

    // Since ModelFn is not a closure we need this workaround to pass the calculated model
    thread_local!(static MODEL: RefCell<Option<Model>> = Default::default());

    let script = r#"
prop angle = 2.0
prop x = 0.0
prop y = 0.0
prop isBlue = false

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::background(
    color: $BLACK
  )
  let points = [
    [0.0, 100.0],
    [-100.0, -100.0],
    [100.0, -100.0],
  ]
  draw::polygon (
    points: [
      [0.0, 100.0],
      [-100.0, -100.0],
      [100.0, -100.0],
    ],
    color: $RED,
    rotate: angle
  )
}

"#;

    let model = model_from_script(script);

    MODEL.with(|m| m.borrow_mut().replace(model));

    app::Builder::new_async(|app| {
        Box::new(async move {
            create_window(app).await;
            MODEL.with(|m| m.borrow_mut().take().unwrap())
        })
    })
        .backends(Backends::PRIMARY | Backends::GL)
        .update(update)
        .run_async()
        .await;
}

async fn create_window(app: &App) {
    let device_desc = DeviceDescriptor {
        limits: Limits {
            max_texture_dimension_2d: 8192,
            ..Limits::downlevel_webgl2_defaults()
        },
        ..Default::default()
    };

    app.new_window()
        .device_descriptor(device_desc)
        .title("nannou web test")
        // .raw_event(raw_event)
        // .key_pressed(key_pressed)
        // .key_released(key_released)
        // .mouse_pressed(mouse_pressed)
        // .mouse_moved(mouse_moved)
        // .mouse_released(mouse_released)
        // .mouse_wheel(mouse_wheel)
        // .touch(touch)
        .view(view)
        .build_async()
        .await
        .expect("nannou window build failed");
}

pub fn model_from_script(script: &str) -> Model {
    let parse_result = VisampDSLParser::parse(Rule::script, script)
        .expect("Failed to parse script")
        .next()
        .unwrap();

    // println!("{:#?}", parse_result);

    let ast = build_ast(parse_result);

    Model::from_script(&ast)
}


fn build_ast(pair: Pair<Rule>) -> Script {
    if pair.as_rule() != Rule::script {
        panic!("script expected");
    }
    let mut script: Script = Script::new();
    // Iterate through each top-level block.
    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::prop_def => {
                script.props.push(build_prop_def(inner));
            },
            Rule::block => {
                script.blocks.push(build_block(inner));
            },
            _ => {}
        }
    }
    script
}

fn build_prop_def(pair: pest::iterators::Pair<Rule>) -> PropertyDef {
    let mut inner_rules = pair.into_inner();
    let name = inner_rules.next().unwrap().as_str().to_string();
    let value_pair = inner_rules.next().unwrap();
    let value = build_value(value_pair);
    PropertyDef { name, value }
}

pub fn build_expression(pair: Pair<Rule>) -> Expression {
    match pair.as_rule() {
        // The top-level expression simply delegates to equality_expr.
        Rule::expression => {
            let inner = pair.into_inner().next().expect("expression must have one child");
            build_expression(inner)
        }
        // equality_expr = relational_expr ~ (("==" | "!=") ~ relational_expr)*
        Rule::equality_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_str() {
                    "==" => BinaryOperator::Equal,
                    "!=" => BinaryOperator::NotEqual,
                    _ => unreachable!("Unexpected equality operator: {}", op_pair.as_str()),
                };
                let right = build_expression(inner.next().unwrap());
                expr = Expression::Binary {
                    left: Box::new(expr),
                    op: operator,
                    right: Box::new(right),
                };
            }
            expr
        }
        // relational_expr = add_expr ~ (("<" | "<=" | ">" | ">=") ~ add_expr)*
        Rule::relational_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_str() {
                    "<"  => BinaryOperator::LessThan,
                    "<=" => BinaryOperator::LessThanOrEqual,
                    ">"  => BinaryOperator::GreaterThan,
                    ">=" => BinaryOperator::GreaterThanOrEqual,
                    _ => unreachable!("Unexpected relational operator: {}", op_pair.as_str()),
                };
                let right = build_expression(inner.next().unwrap());
                expr = Expression::Binary {
                    left: Box::new(expr),
                    op: operator,
                    right: Box::new(right),
                };
            }
            expr
        }
        // add_expr = mul_expr ~ (("+" | "-") ~ mul_expr)*
        Rule::add_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_str() {
                    "+" => BinaryOperator::Add,
                    "-" => BinaryOperator::Subtract,
                    _ => unreachable!("Unexpected additive operator: {}", op_pair.as_str()),
                };
                let right = build_expression(inner.next().unwrap());
                expr = Expression::Binary {
                    left: Box::new(expr),
                    op: operator,
                    right: Box::new(right),
                };
            }
            expr
        }
        // mul_expr = unary_expr ~ (("*" | "/" | "%") ~ unary_expr)*
        Rule::mul_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_str() {
                    "*" => BinaryOperator::Multiply,
                    "/" => BinaryOperator::Divide,
                    "%" => BinaryOperator::Modulus,
                    _ => unreachable!("Unexpected multiplicative operator: {}", op_pair.as_str()),
                };
                let right = build_expression(inner.next().unwrap());
                expr = Expression::Binary {
                    left: Box::new(expr),
                    op: operator,
                    right: Box::new(right),
                };
            }
            expr
        }
        // unary_expr = (unary_operator)* ~ primary_expr
        Rule::unary_expr => {
            let mut inner = pair.into_inner().peekable();
            // Collect any leading unary operators.
            let mut ops = Vec::new();
            while let Some(next) = inner.peek() {
                if next.as_rule() == Rule::unary_operator {
                    let op_str = next.as_str();
                    let op = match op_str {
                        "!" => UnaryOperator::Not,
                        "-" => UnaryOperator::Negate,
                        "+" => UnaryOperator::Plus,
                        _ => unreachable!("Unexpected unary operator: {}", op_str),
                    };
                    ops.push(op);
                    inner.next();
                } else {
                    break;
                }
            }
            // The next token must be a primary expression.
            let mut expr = build_expression(inner.next().unwrap());
            // Wrap the expression with the unary operators, applying the last one first.
            for op in ops.into_iter().rev() {
                expr = Expression::Unary {
                    op,
                    expr: Box::new(expr),
                };
            }
            expr
        }
        // primary_expr = value | "(" ~ expression ~ ")"
        Rule::primary_expr => {
            let inner = pair.into_inner().next().unwrap();
            match inner.as_rule() {
                Rule::value => build_expression(inner),
                Rule::expression => build_expression(inner),
                _ => unreachable!("Unexpected primary expression: {:?}", inner.as_rule()),
            }
        }
        // value: boolean, float, integer, array, string, system_variable, system_constant, identifier
        Rule::value => {
            let token = pair.as_str();
            // Depending on your tokens, you may need more robust logic.
            if token.starts_with('"') {
                // String literal: drop the surrounding quotes.
                Expression::Literal(Literal::String(token[1..token.len()-1].to_string()))
            } else if token == "true" || token == "false" {
                Expression::Literal(Literal::Boolean(token == "true"))
            } else if token.contains('.') {
                // Parse float; adjust error handling as needed.
                Expression::Literal(Literal::Float(token.parse().expect("Invalid float literal")))
            } else if token.chars().all(|ch| ch.is_digit(10) || ch == '-') {
                // Parse integer.
                Expression::Literal(Literal::Integer(token.parse().expect("Invalid integer literal")))
            } else if token.starts_with("$") {
                // System variable.
                Expression::SystemValue(token[1..].to_string())
            } else {
                // Otherwise, assume it's an identifier.
                Expression::Identifier(token.to_string())
            }
        }
        // array = "[" ~ array_elements ~ "]"
        Rule::array => {
            // Depending on your grammar, the first and last characters might be the brackets.
            // We iterate over inner pairs which should be array_elements.
            let elements: Vec<Expression> =
                pair.into_inner().map(build_expression).collect();
            Expression::Array(elements)
        }
        // If the rule is an array element, delegate to build_expression.
        Rule::array_element => build_expression(pair.into_inner().next().unwrap()),
        Rule::system_value => Expression::SystemValue(pair.as_str().to_string()),
        Rule::identifier => Expression::Identifier(pair.as_str().to_string()),
        Rule::float => Expression::Literal(Literal::Float(pair.as_str().parse().expect("Invalid float literal"))),
        // For any unexpected rule, report an error.
        _ => unreachable!("Unexpected rule encountered in build_expression: {:?}", pair.as_rule()),
    }
}

fn build_block(pair: pest::iterators::Pair<Rule>) -> Block {
    // Get the inner pairs from the block.
    let mut inner_pairs = pair.into_inner();

    // The first inner pair should be the block name.
    let block_name_pair = inner_pairs
        .next()
        .expect("Expected block name as the first inner pair of a block");

    // Map the entire block name (as a string) to the appropriate enum variant.
    let block_type = match block_name_pair.as_str() {
        "on_frame" => BlockType::OnFrame,
        "layer_2d" => BlockType::Layer2D,
        // If you later expand your language with more block names, add them here.
        other => panic!("Unexpected block type: {}", other),
    };

    // Parse the remaining inner pairs as statements.
    let mut statements = Vec::new();
    for statement_pair in inner_pairs {
        match statement_pair.as_rule() {
            Rule::statement => {
                // Delegate parsing to a helper function.
                let stmt = build_statement(statement_pair);
                statements.push(stmt);
            }
            // Optionally, warn or ignore if other rules appear.
            other => eprintln!("Warning: encountered unexpected rule in block: {:?}", other),
        }
    }

    Block {
        block_type,
        statements,
    }
}

// An example helper for parsing statements.
fn build_statement(pair: pest::iterators::Pair<Rule>) -> Statement {
    let inner = pair.into_inner().next().expect("Expected a specific statement type");
    match inner.as_rule() {
        Rule::assignment => build_assignment(inner),
        Rule::function_call => build_function_call(inner),
        Rule::let_decl => build_let_decl(inner),
        other => panic!("Unexpected statement type: {:?}", other),
    }
}

fn build_assignment(pair: Pair<Rule>) -> Statement {
    // Expected structure: assignment -> identifier, value
    let mut inner = pair.into_inner();
    let ident_pair = inner
        .next()
        .expect("Expected an identifier in assignment");
    let expression_pair = inner
        .next()
        .expect("Expected a value in assignment");
    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Statement::Assignment(Assignment { ident, expression })
}

fn build_function_call(pair: Pair<Rule>) -> Statement {
    // Expected structure: function_call -> identifier, identifier, function_params
    let mut inner = pair.into_inner();
    let namespace_pair = inner
        .next()
        .expect("Expected namespace identifier in function call");
    let function_pair = inner
        .next()
        .expect("Expected function identifier in function call");
    let namespace = namespace_pair.as_str().to_string();
    let function = function_pair.as_str().to_string();
    let params_pair = inner
        .next()
        .expect("Expected function parameters in function call");
    let args = build_function_params(params_pair);
    Statement::FunctionCall(FunctionCall { namespace, function, args })
}

fn build_function_params(pair: Pair<Rule>) -> Vec<Argument> {
    // According to your grammar, function_params is defined as:
    // "(" ~ argument ~ ("," ~ argument)* ~ ","? ~ ")"
    // Here we iterate over the inner arguments.
    pair.into_inner()
        .filter(|inner| inner.as_rule() == Rule::argument)
        .map(build_argument)
        .collect()
}

fn build_argument(pair: Pair<Rule>) -> Argument {
    // Expected structure: argument -> identifier, value
    let mut inner = pair.into_inner();
    let name_pair = inner
        .next()
        .expect("Expected argument name identifier");
    let expression_pair = inner
        .next()
        .expect("Expected argument value");
    let name = name_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Argument { name, expression }
}

fn build_let_decl(pair: Pair<Rule>) -> Statement {
    // Expected structure: let_decl -> "let" ~ identifier ~ "=" ~ value
    // The literal "let" is skipped so we have identifier, then value.
    let mut inner = pair.into_inner();
    let ident_pair = inner
        .next()
        .expect("Expected identifier in let declaration");
    let expression_pair = inner
        .next()
        .expect("Expected value in let declaration");
    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Statement::LetDecl(LetDecl { ident, expression})
}

fn build_value(pair: pest::iterators::Pair<Rule>) -> Value {
    match pair.as_rule() {
        Rule::boolean => Value::Boolean(pair.as_str().to_string() == "true"),
        Rule::integer => Value::Boolean(pair.as_str().to_string().parse().expect("Failed to convert string to integer")),
        Rule::float => {
            let num = pair.as_str().parse::<f64>()
                .expect("Invalid float value");
            Value::Float(num)
        },
        Rule::system_value => Value::SystemValue(pair.as_str().to_string()),
        Rule::array => {
            // The array rule is expected to have inner values.
            let values: Vec<Value> = pair.into_inner()
                .map(|p| build_value(p))
                .collect();
            Value::Array(values)
        },
        Rule::identifier => Value::Identifier(pair.as_str().to_string()),
        _ => Value::Identifier(pair.as_str().to_string()),  // fallback
    }
}

fn time_ms() -> u128 {
    #[cfg(target_arch = "wasm32")]
    {
        // JS Date.now() returns f64 milliseconds
        Date::now() as u128
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    }
}

/// Our Model now stores a map from property names to their values,
/// making it agnostic to which properties are defined in the script.
#[derive(Debug, Clone)]
pub struct Model {
    pub start_time: u128,
    pub props: HashMap<String, Value>,
    pub blocks: Vec<Block>,
}

impl Model {
    /// Build the dynamic model from the DSL script.
    pub fn from_script(script: &Script) -> Self {
        let mut props  = HashMap::new();
        for prop in &script.props {
            props.insert(prop.name.clone(), prop.value.clone());
        }
        Model {
            start_time: time_ms(),
            props,
            blocks: script.blocks.clone(),
        }
    }
}


#[derive(Debug, Clone)]
struct Declarations {
    pub scopes: Vec<HashMap<String, Value>>,
}

impl Declarations {
    /// Build the dynamic model from the DSL script.
    pub fn new() -> Self {
        let scopes = Vec::new();
        Declarations {
            scopes,
        }
    }
    pub fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }
    pub fn pop_scope(&mut self) {
        self.scopes
            .pop()
            .expect("popped too many scopes");
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
    pub fn contains(&self, name: &str) -> bool {
        for scope in self.scopes.iter().rev() {
            if scope.contains_key(name) {
                return true;
            }
        }
        false
    }
}

/// The update function for nannou. (Here, for demonstration, it simply prints an update message.)
pub fn update(app: &App, model: &mut Model, update: Update) {
    let blocks: Vec<Block> = model.blocks.iter().cloned().collect();
    for block in blocks {
        let _ = match block.block_type {
            BlockType::OnFrame => interpret_event_block(app, block, model),
            _ => Ok({ })
        };
    }
}

/// The view function draws the frame using properties from the dynamic model.
pub fn view(app: &App, model: &Model, frame: Frame) {
    let blocks: Vec<Block> = model.blocks.iter().cloned().collect();
    for block in blocks {
        let _ = match block.block_type {
            BlockType::Layer2D => interpret_layer_block(app, block, model, &frame),
            _ => Ok({ })
        };
    }
}

fn interpret_event_block(app: &App, block: Block, model: &mut Model) -> Result<(), String> {
    let mut decels = Declarations::new();
    decels.push_scope();
    for statement in block.statements.iter() {
        match statement {
            // If you want to use the data inside `LetDecl`
            Statement::LetDecl(let_decl) => interpret_statement_let_decl(let_decl, model, &mut decels),
            // Destructure the Assignment variant
            Statement::Assignment(assignment) => interpret_statement_event_assignment(assignment, model, &mut decels),
            other => panic!("unknown statement : {:?}", other),
        }
    }
    decels.pop_scope();
    Ok({})
}

fn interpret_layer_block(app: &App, block: Block, model: &Model, frame: &Frame) -> Result<(), String> {
    let mut decels = Declarations::new();
    decels.push_scope();
    let draw = app.draw();
    let statements = block.statements.iter().cloned().collect::<Vec<_>>();
    for statement in statements {
        match statement {
            // If you want to use the data inside `LetDecl`
            Statement::LetDecl(let_decl) => interpret_statement_let_decl(&let_decl, model, &mut decels),
            // For a function call variant:
            Statement::FunctionCall(function_call) => interpret_statement_function_call(&function_call, model, &mut decels, &draw),
            // Destructure the Assignment variant
            Statement::Assignment(assignment) => interpret_statement_view_assignment(&assignment, model, &mut decels),
            other => panic!("unknown statement : {:?}", other),
        }
    }
    draw.to_frame(app, &frame).unwrap();
    decels.pop_scope();
    Ok(())
}

fn interpret_statement_let_decl(let_decl: &LetDecl, model: &Model, decels: &mut Declarations) {
    // Check if the identifier already exists in the block scope.
    if decels.contains(&let_decl.ident) {
        // Return an error if the variable is already declared.
        panic!("Error: variable '{}' is already declared in this block.", let_decl.ident);
    }
    // If it doesn't exist, insert the new declaration.
    // Cloning is needed here if LetDecl or Value does not implement Copy.
    let evaluated = evaluate_expression(&let_decl.expression, model, decels);
    decels.declare(let_decl.ident.clone(), evaluated);
}

fn interpret_statement_view_assignment(assignment: &Assignment, model: &Model, decels: &mut Declarations) {
    // Check if the identifier already exists in the block scope.
    if !decels.contains(&assignment.ident) {
        // Return an error if the variable is not declared.
        panic!("Error: variable '{}' is not declared in this block.", assignment.ident);
    }
    let evaluated = evaluate_expression(&assignment.expression, model, decels);
    decels.declare(assignment.ident.clone(), evaluated);
}

fn interpret_statement_event_assignment(assignment: &Assignment, model: &mut Model, decels: &mut Declarations) {
    let evaluated = evaluate_expression(&assignment.expression, model, decels);
    if model.props.contains_key(&assignment.ident) {
        model.props.insert(assignment.ident.clone(), evaluated.clone());
    } else if decels.contains(&assignment.ident) {
        decels.declare(assignment.ident.clone(), evaluated.clone());
    } else {
        panic!("Error: variable '{}' is not declared in this block.", assignment.ident);
    }
}

// might want to chage this to lib call
fn interpret_statement_function_call(function_call: &FunctionCall, model: &Model, decels: &mut Declarations, draw : &Draw) {
    // Process function call using `function_call`
    match function_call.namespace.as_str() {
        "draw" => {
            match function_call.function.as_str() {
                "background" => {
                    let mut draw_background = draw.background();
                    for arg in function_call.args.iter() {
                        match arg.name.as_str() {
                            "color" => {
                                draw_background = draw_background.color(BLACK);
                            },
                            _ => {},
                        }
                    }
                },
                "polygon" => {
                    if let Some(points) = function_call.args.iter().find(|arg| arg.name == "points") {
                        // todo derive point from points argument
                        let evaluated = evaluate_expression(&points.expression, model, decels);
                        let evaluated_points = points_from_value(evaluated);
                        let mut draw_polygon = draw.polygon().points(evaluated_points);
                        for arg in function_call.args.iter() {
                            match arg.name.as_str() {
                                "color" => {
                                    let evaluated = evaluate_expression(&arg.expression, model, decels);
                                    draw_polygon = draw_polygon.color(evaluated.into_srgba_f32());
                                },
                                "rotate" => {
                                    let evaluated = evaluate_expression(&arg.expression, model, decels);
                                    draw_polygon = draw_polygon.rotate(evaluated.into_f32());
                                },
                                other => if other != "points" {
                                    panic!("unknown operation for draw::polygon - {:?}", other);
                                }
                            }
                        }
                    } else {
                        // Handle the case when the argument is not found.
                        println!("No 'points' argument found");
                    }
                },
                _ => {},
            };
        },
        _ => {},
    }
}

fn evaluate_expression(expr: &Expression, model: &Model, decels: &Declarations) -> Value {
    match expr {
        // 1) Literals
        Expression::Literal(lit) => match lit {
            Literal::Boolean(b) => Value::Boolean(*b),
            Literal::Integer(i) => Value::Integer(*i as i64),
            Literal::Float(f)   => Value::Float(*f as f64),
            Literal::String(s)  => Value::String(s.clone()),
        },

        // 2) Identifiers: check block‐scoped first, then props
        Expression::Identifier(name) => {
            model.props
                .get(name)
                .or_else(|| decels.get(name))
                .cloned()
                .unwrap_or_else(|| panic!("Undefined identifier: {}", name))
        },

        // 3) System‐specific values (you can hook these up to real system state)
        Expression::SystemValue(name)  => map_value_runtime(name, model),

        // 4) Arrays
        Expression::Array(elements) => {
            let vals = elements
                .iter()
                .map(|e| evaluate_expression(e, model, decels))
                .collect();
            Value::Array(vals)
        },

        // 5) Parentheses
        Expression::Grouping(inner) => {
            evaluate_expression(inner, model, decels)
        },

        // 6) Unary operators
        Expression::Unary { op, expr: inner } => {
            let v = evaluate_expression(inner, model, decels);
            match op {
                UnaryOperator::Not => {
                    if let Value::Boolean(b) = v {
                        Value::Boolean(!b)
                    } else {
                        panic!("Type error: expected boolean for '!'");
                    }
                }
                UnaryOperator::Negate => match v {
                    Value::Integer(i) => Value::Integer(-i),
                    Value::Float(f)   => Value::Float(-f),
                    _ => panic!("Type error: expected number for unary '-'"),
                },
                UnaryOperator::Plus => v, // Just identity
            }
        },

        // 7) Binary operators
        Expression::Binary { left, op, right } => {
            let l = evaluate_expression(left, model, decels);
            let r = evaluate_expression(right, model, decels);
            match op {
                BinaryOperator::Add => match (l, r) {
                    (Value::Integer(a), Value::Integer(b))       => Value::Integer(a + b),
                    (Value::Float(a),   Value::Float(b))         => Value::Float(a + b),
                    (Value::Integer(a), Value::Float(b))         => Value::Float(a as f64 + b),
                    (Value::Float(a),   Value::Integer(b))       => Value::Float(a + b as f64),
                    (Value::String(a),  Value::String(b))  => Value::String(a + &b),
                    _ => panic!("Type error: '+' on incompatible types"),
                },

                BinaryOperator::Subtract => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) => Value::Integer(a - b),
                    (Value::Float(a),   Value::Float(b))   => Value::Float(a - b),
                    (Value::Integer(a), Value::Float(b))   => Value::Float(a as f64 - b),
                    (Value::Float(a),   Value::Integer(b)) => Value::Float(a - b as f64),
                    _ => panic!("Type error: '-' on incompatible types"),
                },

                BinaryOperator::Multiply => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) => Value::Integer(a * b),
                    (Value::Float(a),   Value::Float(b))   => Value::Float(a * b),
                    (Value::Integer(a), Value::Float(b))   => Value::Float(a as f64 * b),
                    (Value::Float(a),   Value::Integer(b)) => Value::Float(a * b as f64),
                    _ => panic!("Type error: '*' on incompatible types"),
                },

                BinaryOperator::Divide => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) if b != 0 => Value::Integer(a / b),
                    (Value::Float(a),   Value::Float(b))   if b != 0.0 => Value::Float(a / b),
                    (Value::Integer(a), Value::Float(b))   if b != 0.0 => Value::Float(a as f64 / b),
                    (Value::Float(a),   Value::Integer(b)) if b != 0   => Value::Float(a / b as f64),
                    _ => panic!("Division by zero or type error for '/'"),
                },

                BinaryOperator::Modulus => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) if b != 0 => Value::Integer(a % b),
                    _ => panic!("Type error or division by zero for '%'"),
                },

                // Equality / inequality
                BinaryOperator::Equal | BinaryOperator::NotEqual => {
                    let eq = match (&l, &r) {
                        (Value::Boolean(a),      Value::Boolean(b))      => a == b,
                        (Value::Integer(a),       Value::Integer(b))       => a == b,
                        (Value::Float(a),         Value::Float(b))         => a == b,
                        (Value::Integer(a),       Value::Float(b))         => (*a as f64) == *b,
                        (Value::Float(a),         Value::Integer(b))       => *a == (*b as f64),
                        (Value::String(a),     Value::String(b))     => a == b,
                        (Value::Array(a),  Value::Array(b))  => a == b,
                        _ => false,
                    };
                    let result = if *op == BinaryOperator::Equal { eq } else { !eq };
                    Value::Boolean(result)
                }

                // Relational comparisons
                BinaryOperator::LessThan
                | BinaryOperator::LessThanOrEqual
                | BinaryOperator::GreaterThan
                | BinaryOperator::GreaterThanOrEqual => {
                    // Extract floats for mixed comparisons
                    let (fa, fb) = match (l, r) {
                        (Value::Integer(a),     Value::Integer(b))     => (a as f64, b as f64),
                        (Value::Float(a),       Value::Float(b))       => (a, b),
                        (Value::Integer(a),     Value::Float(b))       => (a as f64, b),
                        (Value::Float(a),       Value::Integer(b))     => (a, b as f64),
                        _ => panic!("Type error for relational operator"),
                    };
                    let cmp = match op {
                        BinaryOperator::LessThan           => fa <  fb,
                        BinaryOperator::LessThanOrEqual    => fa <= fb,
                        BinaryOperator::GreaterThan        => fa >  fb,
                        BinaryOperator::GreaterThanOrEqual => fa >= fb,
                        _ => unreachable!(),
                    };
                    Value::Boolean(cmp)
                }
            }
        }
    }
}


fn map_value_runtime(name: &String, model: &Model) -> Value {
    match name.as_str() {
        
        // System variables
        "$TIME_SEC" => Value::Float((time_ms() - model.start_time) as f64 / 1000.0),
        "$TIME_MS" => Value::Integer((time_ms() - model.start_time) as i64),
        // todo $WIDTH and $HEIGHT

        // System constants
        "$BLACK" => Value::Color(BLACK),
        "$WHITE" => Value::Color(WHITE),
        "$RED" => Value::Color(RED),
        "$GREEN" => Value::Color(GREEN),
        "$BLUE" => Value::Color(BLUE),

        other => panic!("Unknown runtime value {:?}", other),
    }
}

fn points_from_value(value: Value) -> Vec<Point2> {
    let mut points: Vec<Point2> = Vec::new();
    if let Value::Array(list_of_points) = value {
        for points_pair in list_of_points.iter() {
            if let Value::Array(points_vec) = points_pair {
                if points_vec.len() == 2 {
                    // Try to convert both values to f32 using the helper.
                    if let (Some(x), Some(y)) = (value_as_f32(&points_vec[0]), value_as_f32(&points_vec[1])) {
                        points.push(pt2(x, y));
                    } else {
                        println!("One of the coordinate values could not be converted to f32.");
                    }
                } else {
                    println!("Expected an array of two numbers, got {} elements.", points_vec.len());
                }
            } else {
                println!("Expected an array of coordinates, but found a non-array value.");
            }
        }
    } else {
        println!("The provided value is not an array.");
    }
    points
}

fn value_as_f32(val: &Value) -> Option<f32> {
    match val {
        Value::Integer(n) => Some(*n as f32),
        Value::Float(n) => Some(*n as f32),
        _ => {
            println!("The value is not a number: {:?}", val);
            None
        }
    }
}


