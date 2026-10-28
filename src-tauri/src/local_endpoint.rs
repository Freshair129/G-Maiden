use std::io;
use std::net::TcpListener;
use std::sync::atomic::{AtomicU16, Ordering};

pub const PORT_START: u16 = 3000;
pub const PORT_END: u16 = 3010;
static PORT: AtomicU16 = AtomicU16::new(PORT_START);

pub fn current_port() -> u16 {
    PORT.load(Ordering::Acquire)
}
pub fn set_port(port: u16) {
    PORT.store(port, Ordering::Release);
}

pub fn bind_available(start: u16, end: u16) -> io::Result<(TcpListener, u16)> {
    bind_range(start, end, |port| TcpListener::bind(("127.0.0.1", port)))
}

fn bind_range<T>(
    start: u16,
    end: u16,
    mut bind: impl FnMut(u16) -> io::Result<T>,
) -> io::Result<(T, u16)> {
    for port in start..=end {
        match bind(port) {
            Ok(listener) => return Ok((listener, port)),
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => {}
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AddrInUse,
        "all G-Maiden loopback ports are occupied",
    ))
}

pub fn health_body(port: u16) -> String {
    format!("{{\"service\":\"g-maiden\",\"port\":{port}}}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn occupied_pair() -> (TcpListener, TcpListener, u16) {
        loop {
            let first = TcpListener::bind(("127.0.0.1", 0)).unwrap();
            let port = first.local_addr().unwrap().port();
            if port == u16::MAX {
                continue;
            }
            if let Ok(second) = TcpListener::bind(("127.0.0.1", port + 1)) {
                return (first, second, port);
            }
        }
    }

    #[test]
    fn occupied_first_port_selects_next_without_touching_owner() {
        let (first, second, port) = occupied_pair();
        // Keep the successful fixture reserved; other parallel tests may use
        // port 0 and immediately claim a port released just before re-binding.
        let mut reserved = Some(second);
        let (selected, actual) = bind_range(port, port + 1, |candidate| {
            if candidate == port {
                TcpListener::bind(("127.0.0.1", candidate))
            } else {
                Ok(reserved.take().unwrap())
            }
        })
        .unwrap();
        assert_eq!(actual, port + 1);
        assert_eq!(selected.local_addr().unwrap().port(), actual);
        assert_eq!(first.local_addr().unwrap().port(), port);
    }

    #[test]
    fn non_conflict_errors_abort_without_trying_other_ports() {
        let mut attempts = 0;
        let result = bind_range::<()>(3000, 3010, |_| {
            attempts += 1;
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        });
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(attempts, 1);
    }

    #[test]
    fn all_busy_fails_bounded_and_health_identifies_selected_port() {
        let (_first, _second, port) = occupied_pair();
        assert_eq!(
            bind_available(port, port + 1).unwrap_err().kind(),
            io::ErrorKind::AddrInUse
        );
        assert_eq!(
            health_body(port),
            format!("{{\"service\":\"g-maiden\",\"port\":{port}}}")
        );
    }
}
