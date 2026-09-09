use pest::iterators::Pair;
use pest::Parser;
use pest_derive::Parser;

use crate::model::*;

#[derive(Parser)]
#[grammar = "visamp_dsl.pest"]
pub struct VisampDSLParser;

/// Formats a rule violation the same way pest renders a syntax error, so the
/// editor can position a squiggle from it and summarise it in the log.
fn located_error(pair: &Pair<Rule>, message: &str) -> String {
    let (line, col) = pair.as_span().start_pos().line_col();
    format!("Parse error:  --> {}:{}\n  |\n  = {}", line, col, message)
}

pub fn build_ast(script: &str) -> Result<Script, String> {
    let pair = VisampDSLParser::parse(Rule::script, script)
        .map_err(|e| format!("Parse error: {}", e))?
        .next()
        .ok_or("Empty parse result")?;

    if pair.as_rule() != Rule::script {
        return Err("script expected".to_string());
    }

    // Kept for the resolver: a `context` declaration is legal anywhere at the
    // top level, so calls cannot be judged until the whole file has been read.
    let for_resolution = pair.clone();

    let mut script: Script = Script::new();
    let mut context_seen = false;
    let mut render_seen = false;

    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::context_decl => {
                if context_seen {
                    return Err(located_error(&inner, "context is already set"));
                }
                context_seen = true;

                let kind_pair = inner
                    .clone()
                    .into_inner()
                    .next()
                    .ok_or("context is missing a value")?;

                script.context = ContextKind::parse(kind_pair.as_str())
                    .ok_or_else(|| located_error(&kind_pair, "expected 2d or 3d"))?;
            }
            Rule::prop_def => {
                script.props.push(build_prop_def(inner));
            }
            Rule::function_def => {
                script.functions.push(build_function_def(inner));
            }
            Rule::block => {
                let block = build_block(inner.clone())?;

                if block.block_type == BlockType::Render {
                    if render_seen {
                        return Err(located_error(&inner, "only one render block is allowed"));
                    }
                    render_seen = true;
                }

                script.blocks.push(block);
            }
            _ => {}
        }
    }
    crate::resolver::resolve(for_resolution.into_inner(), script.context)?;

    Ok(script)
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
        Rule::expression => {
            let inner = pair
                .into_inner()
                .next()
                .expect("expression must have one child");
            build_expression(inner)
        }
        Rule::logical_or_expr
        | Rule::logical_and_expr
        | Rule::bit_or_expr
        | Rule::bit_xor_expr
        | Rule::bit_and_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_rule() {
                    Rule::logical_or_operator => BinaryOperator::Or,
                    Rule::logical_and_operator => BinaryOperator::And,
                    Rule::bit_or_operator => BinaryOperator::BitOr,
                    Rule::bit_xor_operator => BinaryOperator::BitXor,
                    Rule::bit_and_operator => BinaryOperator::BitAnd,
                    _ => unreachable!("Expected a logical or bitwise operator"),
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
        Rule::equality_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_rule() {
                    Rule::equality_operator => match op_pair.as_str() {
                        "==" => BinaryOperator::Equal,
                        "!=" => BinaryOperator::NotEqual,
                        _ => unreachable!(),
                    },
                    _ => unreachable!("Expected equality operator"),
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
        Rule::relational_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_rule() {
                    Rule::relational_operator => match op_pair.as_str() {
                        "<" => BinaryOperator::LessThan,
                        "<=" => BinaryOperator::LessThanOrEqual,
                        ">" => BinaryOperator::GreaterThan,
                        ">=" => BinaryOperator::GreaterThanOrEqual,
                        _ => unreachable!(),
                    },
                    _ => unreachable!("Expected relational operator"),
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
        Rule::add_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_rule() {
                    Rule::add_operator => match op_pair.as_str() {
                        "+" => BinaryOperator::Add,
                        "-" => BinaryOperator::Subtract,
                        _ => unreachable!(),
                    },
                    _ => unreachable!("Expected additive operator"),
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
        Rule::mul_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());
            while let Some(op_pair) = inner.next() {
                let operator = match op_pair.as_rule() {
                    Rule::mul_operator => match op_pair.as_str() {
                        "*" => BinaryOperator::Multiply,
                        "/" => BinaryOperator::Divide,
                        "\\" => BinaryOperator::IntegerDivide,
                        "%" => BinaryOperator::Modulus,
                        _ => unreachable!(),
                    },
                    _ => unreachable!("Expected multiplicative operator"),
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
        Rule::postfix_expr => {
            let mut inner = pair.into_inner();
            let mut expr = build_expression(inner.next().unwrap());

            // Each `[...]` wraps what came before, so a[0][1] nests correctly.
            for index_pair in inner {
                let index = index_pair
                    .into_inner()
                    .next()
                    .expect("index needs an expression");
                expr = Expression::Index {
                    target: Box::new(expr),
                    index: Box::new(build_expression(index)),
                };
            }
            expr
        }
        Rule::unary_expr => {
            let mut inner = pair.into_inner().peekable();
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
            let mut expr = build_expression(inner.next().unwrap());
            for op in ops.into_iter().rev() {
                expr = Expression::Unary {
                    op,
                    expr: Box::new(expr),
                };
            }
            expr
        }
        Rule::primary_expr => {
            let inner = pair.into_inner().next().unwrap();
            match inner.as_rule() {
                Rule::value => build_expression(inner),
                Rule::expression => build_expression(inner),
                _ => unreachable!("Unexpected primary expression: {:?}", inner.as_rule()),
            }
        }
        Rule::value => {
            let token = pair.as_str();
            if token.starts_with('"') {
                Expression::Literal(Literal::String(token[1..token.len() - 1].to_string()))
            } else if token == "true" || token == "false" {
                Expression::Literal(Literal::Boolean(token == "true"))
            } else if token.contains('.') {
                Expression::Literal(Literal::Float(
                    token.parse().expect("Invalid float literal"),
                ))
            } else if token.chars().all(|ch| ch.is_digit(10) || ch == '-') {
                Expression::Literal(Literal::Integer(
                    token.parse().expect("Invalid integer literal"),
                ))
            } else if token.starts_with('$') {
                Expression::SystemValue(token[1..].to_string())
            } else {
                Expression::Identifier(token.to_string())
            }
        }
        Rule::array => {
            let elements: Vec<Expression> = pair.into_inner().map(build_expression).collect();
            Expression::Array(elements)
        }
        Rule::array_element => build_expression(pair.into_inner().next().unwrap()),
        Rule::system_value => {
            let s = pair.as_str();
            // Strip the leading $
            Expression::SystemValue(if s.starts_with('$') {
                s[1..].to_string()
            } else {
                s.to_string()
            })
        }
        Rule::identifier => Expression::Identifier(pair.as_str().to_string()),
        Rule::float => Expression::Literal(Literal::Float(
            pair.as_str().parse().expect("Invalid float literal"),
        )),
        Rule::integer => Expression::Literal(Literal::Integer(
            pair.as_str().parse().expect("Invalid integer literal"),
        )),
        Rule::boolean => Expression::Literal(Literal::Boolean(pair.as_str() == "true")),
        Rule::string => {
            let s = pair.as_str();
            // Strip surrounding quotes
            Expression::Literal(Literal::String(s[1..s.len() - 1].to_string()))
        }
        Rule::call_expr => {
            let mut inner = pair.into_inner();
            let name = inner.next().unwrap().as_str().to_string();
            let args: Vec<(String, Expression)> = inner
                .filter(|p| p.as_rule() == Rule::call_args)
                .flat_map(|p| p.into_inner())
                .filter(|p| p.as_rule() == Rule::call_arg)
                .map(|p| {
                    let mut arg_inner = p.into_inner();
                    let arg_name = arg_inner.next().unwrap().as_str().to_string();
                    let expr = build_expression(arg_inner.next().unwrap());
                    (arg_name, expr)
                })
                .collect();
            Expression::Call { name, args }
        }
        Rule::asset_expr => {
            let mut inner = pair.into_inner();
            let kind = match inner.next().unwrap().as_str() {
                "bitmap" => AssetKind::Bitmap,
                "vector" => AssetKind::Vector,
                "model" => AssetKind::Model,
                other => unreachable!("Unknown asset kind: {other}"),
            };
            // The grammar guarantees the `id:` label and then a string literal
            // here; the label is a bare token so it is not a captured pair.
            let raw = inner.next().unwrap().as_str();
            let id = raw.trim_matches('"').to_string();
            Expression::AssetRef { kind, id }
        }
        Rule::color_expr => {
            let mut inner = pair.into_inner();
            let kind_pair = inner.next().unwrap();
            let kind_str = kind_pair.as_str();
            let kind = match kind_str {
                "rgb" => ColorConstructKind::Rgb,
                "hsl" => ColorConstructKind::Hsl,
                "linear_gradient" => ColorConstructKind::LinearGradient,
                _ => unreachable!("Unknown color construct: {}", kind_str),
            };
            let args: Vec<(String, Expression)> = inner
                .filter(|p| p.as_rule() == Rule::color_args)
                .flat_map(|p| p.into_inner())
                .filter(|p| p.as_rule() == Rule::color_arg)
                .map(|p| {
                    let mut arg_inner = p.into_inner();
                    let name = arg_inner.next().unwrap().as_str().to_string();
                    let expr = build_expression(arg_inner.next().unwrap());
                    (name, expr)
                })
                .collect();
            Expression::ColorConstruct { kind, args }
        }
        Rule::math_expr => {
            let mut inner = pair.into_inner();
            let func_pair = inner.next().unwrap();
            let func = func_pair.as_str().to_string();
            let args: Vec<(String, Expression)> = inner
                .filter(|p| p.as_rule() == Rule::math_args)
                .flat_map(|p| p.into_inner())
                .filter(|p| p.as_rule() == Rule::math_arg)
                .map(|p| {
                    let mut arg_inner = p.into_inner();
                    let name = arg_inner.next().unwrap().as_str().to_string();
                    let expr = build_expression(arg_inner.next().unwrap());
                    (name, expr)
                })
                .collect();
            Expression::MathCall { func, args }
        }
        _ => unreachable!(
            "Unexpected rule encountered in build_expression: {:?}",
            pair.as_rule()
        ),
    }
}

/// Fallible: a half-typed block name reaches here as ordinary user input, and
/// panicking on it aborts the whole wasm module rather than reporting an error.
fn build_block(pair: pest::iterators::Pair<Rule>) -> Result<Block, String> {
    let block_pair = pair.clone();
    let mut inner_pairs = pair.into_inner();

    let block_name_pair = inner_pairs
        .next()
        .ok_or_else(|| located_error(&block_pair, "block is missing a name"))?;

    let block_type = match block_name_pair.as_str() {
        "on_frame" => BlockType::OnFrame,
        "on_init" => BlockType::OnInit,
        "on_resize" => BlockType::OnResize,
        "render" => BlockType::Render,
        other => {
            return Err(located_error(
                &block_name_pair,
                &format!(
                    "unknown block `{}`; expected on_init, on_frame, on_resize or render",
                    other
                ),
            ));
        }
    };

    let mut statements = Vec::new();
    for statement_pair in inner_pairs {
        match statement_pair.as_rule() {
            Rule::statement => {
                let stmt = build_statement(statement_pair);
                statements.push(stmt);
            }
            other => eprintln!("Warning: encountered unexpected rule in block: {:?}", other),
        }
    }

    Ok(Block {
        block_type,
        statements,
    })
}

fn build_statement(pair: pest::iterators::Pair<Rule>) -> Statement {
    let inner = pair
        .into_inner()
        .next()
        .expect("Expected a specific statement type");
    match inner.as_rule() {
        Rule::assignment => build_assignment(inner),
        Rule::call_expr => Statement::Call(build_expression(inner)),
        Rule::incr_decr => build_incr_decr(inner),
        Rule::function_call => build_function_call(inner),
        Rule::let_decl => build_let_decl(inner),
        Rule::if_statement => build_if_statement(inner),
        Rule::for_loop => build_for_loop(inner),
        Rule::while_loop => build_while_loop(inner),
        Rule::return_statement => build_return_statement(inner),
        other => panic!("Unexpected statement type: {:?}", other),
    }
}

/// Builds `x = e` and the compound forms.
///
/// `x += e` is rewritten to `x = x + e` here rather than carried into the AST.
/// The interpreter then needs no new statement kind and the compound forms
/// inherit the existing arithmetic exactly — including that `/` yields a float,
/// so `x /= 2` makes `x` a float just as `x = x / 2` does.
fn build_assignment(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let ident_pair = inner.next().expect("Expected an identifier in assignment");
    let op_pair = inner.next().expect("Expected an assignment operator");
    let expression_pair = inner.next().expect("Expected a value in assignment");

    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);

    let compound = match op_pair.as_str() {
        "+=" => Some(BinaryOperator::Add),
        "-=" => Some(BinaryOperator::Subtract),
        "*=" => Some(BinaryOperator::Multiply),
        "/=" => Some(BinaryOperator::Divide),
        "%=" => Some(BinaryOperator::Modulus),
        _ => None,
    };

    let expression = match compound {
        Some(op) => Expression::Binary {
            left: Box::new(Expression::Identifier(ident.clone())),
            op,
            right: Box::new(expression),
        },
        None => expression,
    };

    Statement::Assignment(Assignment { ident, expression })
}

/// `x++` and `x--`, in either spelling, as `x = x + 1` / `x = x - 1`.
fn build_incr_decr(pair: Pair<Rule>) -> Statement {
    let mut ident = String::new();
    let mut op = BinaryOperator::Add;

    for item in pair.into_inner() {
        match item.as_rule() {
            Rule::identifier => ident = item.as_str().to_string(),
            Rule::incr_decr_operator => {
                if item.as_str() == "--" {
                    op = BinaryOperator::Subtract;
                }
            }
            _ => unreachable!("Unexpected part of an increment"),
        }
    }

    Statement::Assignment(Assignment {
        expression: Expression::Binary {
            left: Box::new(Expression::Identifier(ident.clone())),
            op,
            right: Box::new(Expression::Literal(Literal::Integer(1))),
        },
        ident,
    })
}

fn build_function_call(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let path_pair = inner.next().expect("Expected function path");
    let mut path: Vec<String> = path_pair
        .into_inner()
        .map(|part| part.as_str().to_string())
        .collect();
    let function = path.pop().expect("Expected function name");
    let namespace = path.join("::");
    let params_pair = inner
        .next()
        .expect("Expected function parameters in function call");
    let args = build_function_params(params_pair);
    Statement::FunctionCall(FunctionCall {
        namespace,
        function,
        args,
    })
}

fn build_function_params(pair: Pair<Rule>) -> Vec<Argument> {
    pair.into_inner()
        .filter(|inner| inner.as_rule() == Rule::argument)
        .map(build_argument)
        .collect()
}

fn build_argument(pair: Pair<Rule>) -> Argument {
    let mut inner = pair.into_inner();
    let name_pair = inner.next().expect("Expected argument name identifier");
    let expression_pair = inner.next().expect("Expected argument value");
    let name = name_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Argument { name, expression }
}

fn build_let_decl(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let ident_pair = inner
        .next()
        .expect("Expected identifier in let declaration");
    let expression_pair = inner.next().expect("Expected value in let declaration");
    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Statement::LetDecl(LetDecl { ident, expression })
}

fn build_value(pair: pest::iterators::Pair<Rule>) -> Value {
    match pair.as_rule() {
        Rule::boolean => Value::Boolean(pair.as_str().to_string() == "true"),
        Rule::integer => Value::Integer(
            pair.as_str()
                .parse()
                .expect("Failed to convert string to integer"),
        ),
        Rule::float => Value::Float(pair.as_str().parse::<f64>().expect("Invalid float value")),
        Rule::system_value => Value::SystemValue(pair.as_str().to_string()),
        Rule::array => {
            let values: Vec<Value> = pair.into_inner().map(|p| build_value(p)).collect();
            Value::Array(values)
        }
        Rule::identifier => Value::Identifier(pair.as_str().to_string()),
        _ => Value::Identifier(pair.as_str().to_string()),
    }
}

fn build_if_statement(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let condition = build_expression(inner.next().unwrap());

    let mut then_body = Vec::new();
    let mut else_body = None;

    for item in inner {
        match item.as_rule() {
            Rule::then_block => {
                then_body = item.into_inner().map(|s| build_statement(s)).collect();
            }
            Rule::else_block => {
                else_body = Some(item.into_inner().map(|s| build_statement(s)).collect());
            }
            _ => {}
        }
    }

    Statement::If(IfStatement {
        condition,
        then_body,
        else_body,
    })
}

fn build_for_loop(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let variable = inner.next().unwrap().as_str().to_string();

    let iterable_pair = inner.next().unwrap();
    let iterable = if iterable_pair.as_rule() == Rule::range_expr {
        build_range(iterable_pair)
    } else {
        ForIterable::Expression(build_expression(iterable_pair))
    };

    let body: Vec<Statement> = inner.map(|s| build_statement(s)).collect();

    Statement::For(ForLoop {
        variable,
        iterable,
        body,
    })
}

/// `start .. end`, `start ..= end`, optionally followed by `step n`.
fn build_range(pair: Pair<Rule>) -> ForIterable {
    let mut inner = pair.into_inner();

    let start = build_expression(inner.next().unwrap());
    let inclusive = inner.next().unwrap().as_str() == "..=";
    let end = build_expression(inner.next().unwrap());

    // The `step` keyword is its own pair; the value follows it.
    let step = match inner.next() {
        Some(keyword) if keyword.as_rule() == Rule::step_kw => {
            Some(build_expression(inner.next().expect("step needs a value")))
        }
        other => other.map(build_expression),
    };

    ForIterable::Range {
        start,
        end,
        inclusive,
        step,
    }
}

fn build_while_loop(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let condition = build_expression(inner.next().unwrap());
    let body: Vec<Statement> = inner.map(|s| build_statement(s)).collect();

    Statement::While(WhileLoop { condition, body })
}

fn build_return_statement(pair: Pair<Rule>) -> Statement {
    let inner = pair
        .into_inner()
        .next()
        .expect("return must have an expression");
    Statement::Return(ReturnStatement {
        expression: build_expression(inner),
    })
}

fn build_function_def(pair: Pair<Rule>) -> FunctionDef {
    let mut inner = pair.into_inner();
    let name = inner.next().unwrap().as_str().to_string();

    let mut params = Vec::new();
    let mut body = Vec::new();

    for item in inner {
        match item.as_rule() {
            Rule::param_list => {
                params = item
                    .into_inner()
                    .filter(|p| p.as_rule() == Rule::param)
                    .map(|p| {
                        let mut param_inner = p.into_inner();
                        let name = param_inner.next().unwrap().as_str().to_string();
                        let default = build_expression(param_inner.next().unwrap());
                        ParamDef { name, default }
                    })
                    .collect();
            }
            Rule::statement => {
                body.push(build_statement(item));
            }
            _ => {}
        }
    }

    FunctionDef { name, params, body }
}
