use pest::Parser;
use pest::iterators::Pair;
use pest_derive::Parser;

use crate::model::*;

#[derive(Parser)]
#[grammar = "visamp_dsl.pest"]
pub struct VisampDSLParser;

pub fn build_ast(script: &str) -> Result<Script, String> {
    let pair = VisampDSLParser::parse(Rule::script, script)
        .map_err(|e| format!("Parse error: {}", e))?
        .next()
        .ok_or("Empty parse result")?;

    if pair.as_rule() != Rule::script {
        return Err("script expected".to_string());
    }

    let mut script: Script = Script::new();
    for inner in pair.into_inner() {
        match inner.as_rule() {
            Rule::prop_def => {
                script.props.push(build_prop_def(inner));
            }
            Rule::function_def => {
                script.functions.push(build_function_def(inner));
            }
            Rule::block => {
                script.blocks.push(build_block(inner));
            }
            _ => {}
        }
    }
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
            let inner = pair.into_inner().next().expect("expression must have one child");
            build_expression(inner)
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
                Expression::Literal(Literal::Float(token.parse().expect("Invalid float literal")))
            } else if token.chars().all(|ch| ch.is_digit(10) || ch == '-') {
                Expression::Literal(Literal::Integer(token.parse().expect("Invalid integer literal")))
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
            Expression::SystemValue(if s.starts_with('$') { s[1..].to_string() } else { s.to_string() })
        }
        Rule::identifier => Expression::Identifier(pair.as_str().to_string()),
        Rule::float => Expression::Literal(Literal::Float(pair.as_str().parse().expect("Invalid float literal"))),
        Rule::integer => Expression::Literal(Literal::Integer(pair.as_str().parse().expect("Invalid integer literal"))),
        Rule::boolean => Expression::Literal(Literal::Boolean(pair.as_str() == "true")),
        Rule::string => {
            let s = pair.as_str();
            // Strip surrounding quotes
            Expression::Literal(Literal::String(s[1..s.len()-1].to_string()))
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
        Rule::color_expr => {
            let mut inner = pair.into_inner();
            let kind_pair = inner.next().unwrap();
            let kind_str = kind_pair.as_str();
            let kind = match kind_str {
                "rgb" => ColorConstructKind::Rgb,
                "hsl" => ColorConstructKind::Hsl,
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
        _ => unreachable!("Unexpected rule encountered in build_expression: {:?}", pair.as_rule()),
    }
}

fn build_block(pair: pest::iterators::Pair<Rule>) -> Block {
    let mut inner_pairs = pair.into_inner();

    let block_name_pair = inner_pairs
        .next()
        .expect("Expected block name as the first inner pair of a block");

    let block_type = match block_name_pair.as_str() {
        "on_frame" => BlockType::OnFrame,
        "layer_2d" => BlockType::Layer2D,
        other => panic!("Unexpected block type: {}", other),
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

    Block {
        block_type,
        statements,
    }
}

fn build_statement(pair: pest::iterators::Pair<Rule>) -> Statement {
    let inner = pair.into_inner().next().expect("Expected a specific statement type");
    match inner.as_rule() {
        Rule::assignment => build_assignment(inner),
        Rule::function_call => build_function_call(inner),
        Rule::let_decl => build_let_decl(inner),
        Rule::if_statement => build_if_statement(inner),
        Rule::for_loop => build_for_loop(inner),
        Rule::while_loop => build_while_loop(inner),
        Rule::return_statement => build_return_statement(inner),
        other => panic!("Unexpected statement type: {:?}", other),
    }
}

fn build_assignment(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let ident_pair = inner.next().expect("Expected an identifier in assignment");
    let expression_pair = inner.next().expect("Expected a value in assignment");
    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Statement::Assignment(Assignment { ident, expression })
}

fn build_function_call(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let namespace_pair = inner.next().expect("Expected namespace identifier in function call");
    let function_pair = inner.next().expect("Expected function identifier in function call");
    let namespace = namespace_pair.as_str().to_string();
    let function = function_pair.as_str().to_string();
    let params_pair = inner.next().expect("Expected function parameters in function call");
    let args = build_function_params(params_pair);
    Statement::FunctionCall(FunctionCall { namespace, function, args })
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
    let ident_pair = inner.next().expect("Expected identifier in let declaration");
    let expression_pair = inner.next().expect("Expected value in let declaration");
    let ident = ident_pair.as_str().to_string();
    let expression = build_expression(expression_pair);
    Statement::LetDecl(LetDecl { ident, expression })
}

fn build_value(pair: pest::iterators::Pair<Rule>) -> Value {
    match pair.as_rule() {
        Rule::boolean => Value::Boolean(pair.as_str().to_string() == "true"),
        Rule::integer => Value::Integer(pair.as_str().parse().expect("Failed to convert string to integer")),
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
    let iterable = build_expression(inner.next().unwrap());
    let body: Vec<Statement> = inner.map(|s| build_statement(s)).collect();

    Statement::For(ForLoop {
        variable,
        iterable,
        body,
    })
}

fn build_while_loop(pair: Pair<Rule>) -> Statement {
    let mut inner = pair.into_inner();
    let condition = build_expression(inner.next().unwrap());
    let body: Vec<Statement> = inner.map(|s| build_statement(s)).collect();

    Statement::While(WhileLoop {
        condition,
        body,
    })
}

fn build_return_statement(pair: Pair<Rule>) -> Statement {
    let inner = pair.into_inner().next().expect("return must have an expression");
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
                params = item.into_inner()
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
