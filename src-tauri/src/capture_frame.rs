//! Shared identity and ROI contracts for one acquired desktop frame.
//!
//! Pixels are kept in small BGRA crops. DXGI callers can fill several crops
//! from one acquired texture; the GDI fallback can crop them from one bitmap.

use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CaptureRoiKind {
    Minimap,
    DraftRoster,
    SelectedTargetHud,
    TopHeroBar,
    Custom(u16),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaptureRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl CaptureRect {
    pub const fn new(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn fits(self, screen_width: u32, screen_height: u32) -> bool {
        self.width > 0
            && self.height > 0
            && self
                .x
                .checked_add(self.width)
                .is_some_and(|right| right <= screen_width)
            && self
                .y
                .checked_add(self.height)
                .is_some_and(|bottom| bottom <= screen_height)
    }

    fn byte_len(self) -> Option<usize> {
        (self.width as usize)
            .checked_mul(self.height as usize)?
            .checked_mul(4)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaptureRoi {
    pub kind: CaptureRoiKind,
    pub rect: CaptureRect,
}

impl CaptureRoi {
    pub const fn new(kind: CaptureRoiKind, x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            kind,
            rect: CaptureRect::new(x, y, width, height),
        }
    }

    pub fn fits(self, screen_width: u32, screen_height: u32) -> bool {
        self.rect.fits(screen_width, screen_height)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrameCaptureIdentity {
    pub frame_id: u64,
    /// Milliseconds from this process's monotonic clock origin.
    pub acquired_at_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrameCaptureMetadata {
    pub frame_id: u64,
    pub session_epoch: u64,
    pub acquired_at_ms: u64,
    pub display_id: u64,
    pub screen_width: u32,
    pub screen_height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureBackend {
    Dxgi,
    Gdi,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CapturedRoi {
    pub kind: CaptureRoiKind,
    pub rect: CaptureRect,
    /// Tightly packed BGRA8 pixels, exactly `rect.width * rect.height * 4` bytes.
    pub bgra: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FrameBundle {
    pub metadata: FrameCaptureMetadata,
    pub backend: CaptureBackend,
    pub regions: Vec<CapturedRoi>,
}

impl FrameBundle {
    pub fn new(
        metadata: FrameCaptureMetadata,
        backend: CaptureBackend,
        regions: Vec<CapturedRoi>,
    ) -> Option<Self> {
        if metadata.screen_width == 0 || metadata.screen_height == 0 || regions.is_empty() {
            return None;
        }

        let mut seen = HashSet::with_capacity(regions.len());
        for region in &regions {
            if !region
                .rect
                .fits(metadata.screen_width, metadata.screen_height)
                || region.bgra.len() != region.rect.byte_len()?
                || !seen.insert(region.kind)
            {
                return None;
            }
        }

        Some(Self {
            metadata,
            backend,
            regions,
        })
    }

    pub fn region(&self, kind: CaptureRoiKind) -> Option<&CapturedRoi> {
        self.regions.iter().find(|region| region.kind == kind)
    }

    pub fn into_region(self, kind: CaptureRoiKind) -> Option<CapturedRoi> {
        self.regions.into_iter().find(|region| region.kind == kind)
    }

    /// Build a bundle from a single CPU frame. This is used by the GDI recovery
    /// backend so all ROIs share the pixels from one BitBlt acquisition.
    pub fn from_full_frame(
        metadata: FrameCaptureMetadata,
        backend: CaptureBackend,
        requests: &[CaptureRoi],
        bgra: &[u8],
    ) -> Option<Self> {
        let screen_len = (metadata.screen_width as usize)
            .checked_mul(metadata.screen_height as usize)?
            .checked_mul(4)?;
        if bgra.len() != screen_len
            || !valid_requests(requests, metadata.screen_width, metadata.screen_height)
        {
            return None;
        }

        let mut regions = Vec::with_capacity(requests.len());
        for request in requests {
            let row_len = (request.rect.width as usize).checked_mul(4)?;
            let mut crop = vec![0; request.rect.byte_len()?];
            for row in 0..request.rect.height as usize {
                let source_start = ((request.rect.y as usize + row)
                    .checked_mul(metadata.screen_width as usize)?
                    .checked_add(request.rect.x as usize)?)
                .checked_mul(4)?;
                let source_end = source_start.checked_add(row_len)?;
                let target_start = row.checked_mul(row_len)?;
                let target_end = target_start.checked_add(row_len)?;
                crop[target_start..target_end].copy_from_slice(&bgra[source_start..source_end]);
            }
            regions.push(CapturedRoi {
                kind: request.kind,
                rect: request.rect,
                bgra: crop,
            });
        }

        Self::new(metadata, backend, regions)
    }
}

pub fn valid_requests(requests: &[CaptureRoi], screen_width: u32, screen_height: u32) -> bool {
    if requests.is_empty() {
        return false;
    }
    let mut seen = HashSet::with_capacity(requests.len());
    requests
        .iter()
        .all(|request| request.fits(screen_width, screen_height) && seen.insert(request.kind))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metadata() -> FrameCaptureMetadata {
        FrameCaptureMetadata {
            frame_id: 18,
            session_epoch: 7,
            acquired_at_ms: 12_345,
            display_id: 3,
            screen_width: 6,
            screen_height: 4,
        }
    }

    #[test]
    fn one_frame_bundle_contains_multiple_rois_with_shared_identity() {
        let mut screen = Vec::new();
        for y in 0..4u8 {
            for x in 0..6u8 {
                screen.extend_from_slice(&[x, y, 0, 255]);
            }
        }
        let requests = [
            CaptureRoi::new(CaptureRoiKind::Minimap, 1, 1, 2, 2),
            CaptureRoi::new(CaptureRoiKind::SelectedTargetHud, 4, 0, 2, 1),
        ];

        let bundle =
            FrameBundle::from_full_frame(metadata(), CaptureBackend::Gdi, &requests, &screen)
                .expect("valid crops from one source frame");

        assert_eq!(bundle.metadata.frame_id, 18);
        assert_eq!(bundle.metadata.session_epoch, 7);
        assert_eq!(bundle.metadata.acquired_at_ms, 12_345);
        assert_eq!(
            bundle.region(CaptureRoiKind::Minimap).unwrap().bgra[0..2],
            [1, 1]
        );
        assert_eq!(
            bundle
                .region(CaptureRoiKind::SelectedTargetHud)
                .unwrap()
                .bgra[0..2],
            [4, 0]
        );
    }

    #[test]
    fn invalid_or_overflowing_roi_coordinates_are_rejected() {
        for roi in [
            CaptureRoi::new(CaptureRoiKind::Minimap, 0, 0, 0, 1),
            CaptureRoi::new(CaptureRoiKind::Minimap, 6, 0, 1, 1),
            CaptureRoi::new(CaptureRoiKind::Minimap, 5, 0, 2, 1),
            CaptureRoi::new(CaptureRoiKind::Minimap, u32::MAX, 0, 2, 1),
        ] {
            assert!(!roi.fits(6, 4), "unexpectedly accepted {roi:?}");
            assert!(!valid_requests(&[roi], 6, 4));
        }
    }

    #[test]
    fn empty_duplicate_and_malformed_bundles_are_rejected() {
        assert!(!valid_requests(&[], 6, 4));
        let duplicate = [
            CaptureRoi::new(CaptureRoiKind::Minimap, 0, 0, 1, 1),
            CaptureRoi::new(CaptureRoiKind::Minimap, 1, 0, 1, 1),
        ];
        assert!(!valid_requests(&duplicate, 6, 4));

        let malformed = CapturedRoi {
            kind: CaptureRoiKind::Minimap,
            rect: CaptureRect::new(0, 0, 2, 1),
            bgra: vec![0; 7],
        };
        assert!(FrameBundle::new(metadata(), CaptureBackend::Dxgi, vec![malformed]).is_none());
    }
}
