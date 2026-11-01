//! Per-stream gain must never change another event or the rodio session.
use windows::Win32::Media::Audio::{IAudioClient, IAudioStreamVolume};
pub(super) struct StreamGain(IAudioStreamVolume);
impl StreamGain {
    pub unsafe fn new(client: &IAudioClient) -> windows::core::Result<Self> {
        Ok(Self(client.GetService()?))
    }
    pub unsafe fn set(&self, gain: f32) -> windows::core::Result<()> {
        self.0.SetChannelVolume(0, gain)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::{Media::Audio::*, System::Com::*};
    #[test]
    #[ignore = "requires a real shared-mode audio endpoint; initializes silent streams only"]
    fn native_gain_is_isolated_from_sibling_stream_and_session() {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
            let endpoint = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .unwrap();
            let open = || {
                let client: IAudioClient = endpoint.Activate(CLSCTX_ALL, None).unwrap();
                let format = WAVEFORMATEX {
                    wFormatTag: 3,
                    nChannels: 1,
                    nSamplesPerSec: 48000,
                    nAvgBytesPerSec: 192000,
                    nBlockAlign: 4,
                    wBitsPerSample: 32,
                    cbSize: 0,
                };
                client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                            | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                        500_000,
                        0,
                        &format,
                        None,
                    )
                    .unwrap();
                client
            };
            let first = open();
            let sibling = open();
            let session: ISimpleAudioVolume = first.GetService().unwrap();
            struct Restore(ISimpleAudioVolume, f32);
            impl Drop for Restore {
                fn drop(&mut self) {
                    unsafe {
                        let _ = self.0.SetMasterVolume(self.1, std::ptr::null());
                    }
                }
            }
            let original = session.GetMasterVolume().unwrap();
            let _restore = Restore(session.clone(), original);
            StreamGain::new(&first).unwrap().set(0.25).unwrap();
            assert_eq!(
                session.GetMasterVolume().unwrap(),
                original,
                "fade changed the shared session volume"
            );
            let first_gain: IAudioStreamVolume = first.GetService().unwrap();
            let sibling_gain: IAudioStreamVolume = sibling.GetService().unwrap();
            assert_eq!(first_gain.GetChannelVolume(0).unwrap(), 0.25);
            assert_eq!(sibling_gain.GetChannelVolume(0).unwrap(), 1.0);
            // Neither stream is started and no PCM buffer is submitted.
        }
    }
}
