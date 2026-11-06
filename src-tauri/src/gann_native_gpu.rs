#[cfg(test)]
#[path = "gann_native_gpu_tests.rs"]
mod tests;
use super::decode::Planar;
use std::sync::OnceLock;
use windows::{
    core::*,
    Win32::Graphics::{
        Direct3D::{Fxc::*, *},
        Direct3D11::*,
        Dxgi::Common::*,
    },
};

type NativeResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;
type ShaderCode = (Vec<u8>, Vec<u8>);
const SHADER: &str = include_str!("gann_native_color.hlsl");

fn shaders() -> std::result::Result<&'static ShaderCode, String> {
    static CODE: OnceLock<std::result::Result<ShaderCode, String>> = OnceLock::new();
    CODE.get_or_init(|| unsafe {
        let compile = |entry, target| -> std::result::Result<Vec<u8>, String> {
            let (mut code, mut errors) = (None, None);
            let result = D3DCompile(
                SHADER.as_ptr().cast(),
                SHADER.len(),
                s!("gann_native_color.hlsl"),
                None,
                None,
                entry,
                target,
                D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_OPTIMIZATION_LEVEL3,
                0,
                &mut code,
                Some(&mut errors),
            );
            if let Err(error) = result {
                let detail = errors
                    .map(|blob: ID3DBlob| {
                        String::from_utf8_lossy(std::slice::from_raw_parts(
                            blob.GetBufferPointer().cast(),
                            blob.GetBufferSize(),
                        ))
                        .into_owned()
                    })
                    .unwrap_or_default();
                return Err(format!("native color shader: {error}: {detail}"));
            }
            let code = code.ok_or("native color shader bytecode")?;
            Ok(
                std::slice::from_raw_parts(code.GetBufferPointer().cast(), code.GetBufferSize())
                    .to_vec(),
            )
        };
        Ok((
            compile(s!("vertex"), s!("vs_5_0"))?,
            compile(s!("pixel"), s!("ps_5_0"))?,
        ))
    })
    .as_ref()
    .map_err(Clone::clone)
}

pub(super) struct Converter {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    textures: Vec<ID3D11Texture2D>,
    views: Vec<Option<ID3D11ShaderResourceView>>,
    vertex: ID3D11VertexShader,
    pixel: ID3D11PixelShader,
    constants: ID3D11Buffer,
    targets: Vec<(ID3D11Texture2D, ID3D11RenderTargetView)>,
    width: usize,
    height: usize,
}
impl Converter {
    pub unsafe fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        width: usize,
        height: usize,
    ) -> NativeResult<Self> {
        if width == 0 || height == 0 || width > 8192 || height > 8192 || width * height > 4_194_304
        {
            return Err("native GPU dimensions".into());
        }
        let code = shaders()?;
        let (mut vertex, mut pixel, mut constants) = (None, None, None);
        device.CreateVertexShader(&code.0, None, Some(&mut vertex))?;
        device.CreatePixelShader(&code.1, None, Some(&mut pixel))?;
        device.CreateBuffer(
            &D3D11_BUFFER_DESC {
                ByteWidth: 16,
                BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                ..Default::default()
            },
            None,
            Some(&mut constants),
        )?;
        let (mut textures, mut views) = (Vec::new(), Vec::new());
        for (w, h) in [
            (width, height),
            (width.div_ceil(2), height.div_ceil(2)),
            (width.div_ceil(2), height.div_ceil(2)),
            (width, height),
        ] {
            let mut texture = None;
            device.CreateTexture2D(
                &D3D11_TEXTURE2D_DESC {
                    Width: w as u32,
                    Height: h as u32,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_R8_UINT,
                    SampleDesc: DXGI_SAMPLE_DESC {
                        Count: 1,
                        Quality: 0,
                    },
                    BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                    ..Default::default()
                },
                None,
                Some(&mut texture),
            )?;
            let texture = texture.ok_or("native GPU plane")?;
            let mut view = None;
            device.CreateShaderResourceView(&texture, None, Some(&mut view))?;
            textures.push(texture);
            views.push(Some(view.ok_or("native GPU plane view")?));
        }
        Ok(Self {
            device: device.clone(),
            context: context.clone(),
            textures,
            views,
            vertex: vertex.ok_or("native vertex shader")?,
            pixel: pixel.ok_or("native pixel shader")?,
            constants: constants.ok_or("native shader constants")?,
            targets: Vec::new(),
            width,
            height,
        })
    }
    pub unsafe fn render(&mut self, frame: &Planar, target: &ID3D11Texture2D) -> NativeResult<()> {
        let (w, h) = (self.width, self.height);
        if (frame.width, frame.height) != (w, h)
            || frame.planes.iter().enumerate().any(|(i, p)| {
                p.len()
                    != if i == 1 || i == 2 {
                        w.div_ceil(2) * h.div_ceil(2)
                    } else {
                        w * h
                    }
            })
        {
            return Err("native GPU plane bounds".into());
        }
        for (i, plane) in frame.planes.iter().enumerate() {
            let pitch = if i == 1 || i == 2 { w.div_ceil(2) } else { w };
            self.context.UpdateSubresource(
                &self.textures[i],
                0,
                None,
                plane.as_ptr().cast(),
                pitch as u32,
                0,
            );
        }
        let constants = [
            frame.diagnostic_index.unwrap_or(0),
            u32::from(frame.diagnostic_index.is_some() && w >= 384 && h >= 420),
            0,
            0,
        ];
        self.context
            .UpdateSubresource(&self.constants, 0, None, constants.as_ptr().cast(), 0, 0);
        let view =
            if let Some((_, view)) = self.targets.iter().find(|(texture, _)| texture == target) {
                view.clone()
            } else {
                if self.targets.len() == 3 {
                    return Err("native color target budget".into());
                }
                let mut view = None;
                self.device
                    .CreateRenderTargetView(target, None, Some(&mut view))?;
                let view = view.ok_or("native color target")?;
                self.targets.push((target.clone(), view.clone()));
                view
            };
        self.context.OMSetRenderTargets(Some(&[Some(view)]), None);
        self.context.RSSetViewports(Some(&[D3D11_VIEWPORT {
            Width: w as f32,
            Height: h as f32,
            MaxDepth: 1.,
            ..Default::default()
        }]));
        self.context
            .IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        self.context.VSSetShader(&self.vertex, None);
        self.context.PSSetShader(&self.pixel, None);
        self.context.PSSetShaderResources(0, Some(&self.views));
        self.context
            .PSSetConstantBuffers(0, Some(&[Some(self.constants.clone())]));
        self.context.Draw(3, 0);
        self.context.OMSetRenderTargets(None, None);
        self.context
            .PSSetShaderResources(0, Some(&[None, None, None, None]));
        Ok(())
    }
}
