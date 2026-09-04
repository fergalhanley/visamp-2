use std::env;
use std::fs;
use std::io::{self, Read};
use std::process::ExitCode;

use visamp_2::{validate_script, COMPILER_VERSION};

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let input = match args.next().as_deref() {
        Some("--version" | "-V") => {
            println!("{COMPILER_VERSION}");
            return ExitCode::SUCCESS;
        }
        Some("--help" | "-h") => {
            println!("Usage: visamp-validate [FILE]\n       visamp-validate --version\n\nReads stdin when FILE is omitted.");
            return ExitCode::SUCCESS;
        }
        Some(path) => match fs::read_to_string(path) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("Could not read {path}: {error}");
                return ExitCode::from(2);
            }
        },
        None => {
            let mut source = String::new();
            if let Err(error) = io::stdin().read_to_string(&mut source) {
                eprintln!("Could not read stdin: {error}");
                return ExitCode::from(2);
            }
            source
        }
    };

    if args.next().is_some() {
        eprintln!("Expected at most one input file");
        return ExitCode::from(2);
    }

    let diagnostic = validate_script(&input);
    if diagnostic.is_empty() {
        println!("OK");
        ExitCode::SUCCESS
    } else {
        eprintln!("{diagnostic}");
        ExitCode::FAILURE
    }
}
