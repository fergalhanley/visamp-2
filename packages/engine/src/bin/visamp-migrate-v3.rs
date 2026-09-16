use std::io::{self, Read, Write};
use std::process::ExitCode;
fn main() -> ExitCode {
    let mut source = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut source) {
        eprintln!("{error}");
        return ExitCode::from(2);
    }
    match visamp_2::source_migration::migrate(&source) {
        Ok(result) => match io::stdout().write_all(result.as_bytes()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(2)
            }
        },
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
