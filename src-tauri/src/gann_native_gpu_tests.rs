use super::*;
use windows::Win32::{
    Foundation::HMODULE,
    Graphics::{Direct3D::*, Direct3D11::*, Dxgi::Common::*},
};

#[test]
#[ignore = "requires a real D3D11 hardware device; reads GPU output without displaying it"]
fn hardware_conversion_matches_integer_reference_including_odd_edges_and_markers() {
    unsafe {
        let mut device = None;
        let mut context = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&[D3D_FEATURE_LEVEL_11_0]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .unwrap();
        let device = device.unwrap();
        let context = context.unwrap();
        for (w, h) in [(17_usize, 19_usize), (960, 420)] {
            let mut converter = Converter::new(&device, &context, w, h).unwrap();
            let mut texture = None;
            let desc = D3D11_TEXTURE2D_DESC {
                Width: w as u32,
                Height: h as u32,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
                ..Default::default()
            };
            device
                .CreateTexture2D(&desc, None, Some(&mut texture))
                .unwrap();
            let texture = texture.unwrap();
            let mut staging = None;
            device
                .CreateTexture2D(
                    &D3D11_TEXTURE2D_DESC {
                        Usage: D3D11_USAGE_STAGING,
                        BindFlags: 0,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        ..desc
                    },
                    None,
                    Some(&mut staging),
                )
                .unwrap();
            let staging = staging.unwrap();
            for marker in [None, Some(255), Some(429)] {
                let mut frame = super::super::decode::Planar {
                    width: w,
                    height: h,
                    planes: [
                        (0..w * h).map(|i| (i % 256) as u8).collect(),
                        (0..w.div_ceil(2) * h.div_ceil(2))
                            .map(|i| ((i * 31) % 256) as u8)
                            .collect(),
                        (0..w.div_ceil(2) * h.div_ceil(2))
                            .map(|i| ((i * 67) % 256) as u8)
                            .collect(),
                        (0..w * h).map(|i| ((i * 17) % 256) as u8).collect(),
                    ],
                    diagnostic_index: marker,
                };
                converter.render(&frame, &texture).unwrap();
                context.CopyResource(&staging, &texture);
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                context
                    .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                    .unwrap();
                let mut result = Vec::new();
                for y in 0..h {
                    result.extend_from_slice(std::slice::from_raw_parts(
                        (mapped.pData as *const u8).add(y * mapped.RowPitch as usize),
                        w * 4,
                    ));
                }
                context.Unmap(&staging, 0);
                assert_eq!(result, frame.reference_bgra(), "{w}x{h}, marker={marker:?}");
                frame.planes[0].pop();
                assert!(converter.render(&frame, &texture).is_err());
            }
        }
    }
}
