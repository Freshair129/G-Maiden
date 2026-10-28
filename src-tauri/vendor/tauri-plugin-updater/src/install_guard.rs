pub fn commit_prepared<P, T, E>(
    prepared: P,
    guard: impl FnOnce() -> Result<(), E>,
    commit: impl FnOnce(P) -> Result<T, E>,
) -> Result<T, E> {
    guard()?;
    commit(prepared)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn game_start_during_preparation_prevents_launch_and_exit_hook() {
        let running = std::cell::Cell::new(false);
        let launched = std::cell::Cell::new(false);
        let prepared = {
            running.set(true);
            vec![1_u8, 2]
        };
        let result = commit_prepared(
            prepared,
            || {
                if running.get() {
                    Err("game running")
                } else {
                    Ok(())
                }
            },
            |_| {
                launched.set(true);
                Ok(())
            },
        );
        assert_eq!(result, Err("game running"));
        assert!(!launched.get());
    }
    #[test]
    fn idle_prepared_install_commits_once() {
        assert_eq!(commit_prepared(42, || Ok::<_, ()>(()), Ok).unwrap(), 42);
    }
}
