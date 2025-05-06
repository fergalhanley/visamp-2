// native app entry_point

use async_std::task::block_on;

use visamp::run_app;

mod visamp;

fn main() {
    block_on(async {
        run_app().await;
    });
}
