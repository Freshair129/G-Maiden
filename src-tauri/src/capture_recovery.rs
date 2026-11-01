//! Resource replacement contract for APIs with a single live owner per output.
pub fn replace_released<T, E>(
    slot: &mut Option<T>,
    create: impl FnOnce() -> Result<T, E>,
) -> Result<(), E> {
    drop(slot.take());
    *slot = Some(create()?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, rc::Rc};
    struct Exclusive(Rc<Cell<bool>>);
    impl Drop for Exclusive {
        fn drop(&mut self) {
            self.0.set(false);
        }
    }

    #[test]
    fn releases_old_interface_before_requesting_exclusive_replacement() {
        let held = Rc::new(Cell::new(true));
        let mut slot = Some(Exclusive(held.clone()));
        let result = replace_released(&mut slot, || {
            if held.get() {
                return Err("already duplicating output");
            }
            held.set(true);
            Ok(Exclusive(held.clone()))
        });
        assert!(result.is_ok());
        assert!(slot.is_some() && held.get());
    }

    #[test]
    fn failed_recreation_leaves_no_invalid_interface_and_allows_retry() {
        let held = Rc::new(Cell::new(true));
        let mut slot = Some(Exclusive(held.clone()));
        assert!(replace_released(&mut slot, || Err::<Exclusive, _>("display switched")).is_err());
        assert!(slot.is_none());
        assert!(!held.get());
        replace_released(&mut slot, || {
            assert!(!held.get());
            held.set(true);
            Ok::<_, ()>(Exclusive(held.clone()))
        })
        .unwrap();
        assert!(held.get());
        drop(slot);
        assert!(!held.get());
    }
}
