use crate::voice_turn::{BackendFinish, BackendProgress, BackendStart, TurnReason, VoiceBackend};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const CAPTURE_BUFFER_BYTES: usize = 480_000;
const INPUT_OPEN_TIMEOUT_MS: u64 = 2_000;
const CAPTURE_SAMPLE_RATE: u32 = 16_000;
const RING_MAX_FRAMES: usize = 48_000;
const RING_MAX_SAMPLES: usize = 1_000_000;

static GLOBAL_MIC_ENABLED: OnceLock<Arc<AtomicBool>> = OnceLock::new();

pub fn shared_mic_enabled() -> Arc<AtomicBool> {
    Arc::clone(GLOBAL_MIC_ENABLED.get_or_init(|| Arc::new(AtomicBool::new(false))))
}

pub fn set_global_mic_enabled(enabled: bool) {
    shared_mic_enabled().store(enabled, Ordering::Release);
}

pub fn mic_enabled_from_settings(json: Option<&str>) -> bool {
    json.and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .and_then(|settings| {
            settings
                .get("voice")
                .and_then(|voice| voice.get("micEnabled"))
                .and_then(serde_json::Value::as_bool)
        })
        .unwrap_or(false)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputSampleFormat {
    I8,
    I16,
    I32,
    I64,
    U8,
    U16,
    U32,
    U64,
    F32,
    F64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputConfig {
    pub sample_rate: u32,
    pub channels: usize,
    pub sample_format: InputSampleFormat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputDeviceError {
    NoDevice,
    PermissionDenied,
    Other,
}

pub enum InputSamples<'a> {
    I8(&'a [i8]),
    I16(&'a [i16]),
    I32(&'a [i32]),
    I64(&'a [i64]),
    U8(&'a [u8]),
    U16(&'a [u16]),
    U32(&'a [u32]),
    U64(&'a [u64]),
    F32(&'a [f32]),
    F64(&'a [f64]),
}

pub type InputDataCallback = Box<dyn for<'a> FnMut(InputSamples<'a>) + Send>;
pub type InputErrorCallback = Box<dyn FnMut() + Send>;

pub trait InputStream {
    fn play(&mut self) -> Result<(), InputDeviceError>;
}

pub trait InputDevice: Send + Sync {
    fn default_input_config(
        &self,
    ) -> Result<(InputConfig, Box<dyn InputDeviceSession>), InputDeviceError>;
}

pub trait InputDeviceSession {
    fn build_input_stream(
        &self,
        config: InputConfig,
        on_data: InputDataCallback,
        on_error: InputErrorCallback,
    ) -> Result<Box<dyn InputStream>, InputDeviceError>;
}

pub struct CpalInputDevice;

impl CpalInputDevice {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CpalInputDevice {
    fn default() -> Self {
        Self::new()
    }
}

impl InputDevice for CpalInputDevice {
    fn default_input_config(
        &self,
    ) -> Result<(InputConfig, Box<dyn InputDeviceSession>), InputDeviceError> {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or(InputDeviceError::NoDevice)?;
        let supported = device.default_input_config().map_err(|error| match error {
            cpal::DefaultStreamConfigError::DeviceNotAvailable => InputDeviceError::NoDevice,
            other => classify_open_error(&other.to_string()),
        })?;
        let sample_format = match supported.sample_format() {
            cpal::SampleFormat::I8 => InputSampleFormat::I8,
            cpal::SampleFormat::I16 => InputSampleFormat::I16,
            cpal::SampleFormat::I32 => InputSampleFormat::I32,
            cpal::SampleFormat::I64 => InputSampleFormat::I64,
            cpal::SampleFormat::U8 => InputSampleFormat::U8,
            cpal::SampleFormat::U16 => InputSampleFormat::U16,
            cpal::SampleFormat::U32 => InputSampleFormat::U32,
            cpal::SampleFormat::U64 => InputSampleFormat::U64,
            cpal::SampleFormat::F32 => InputSampleFormat::F32,
            cpal::SampleFormat::F64 => InputSampleFormat::F64,
            _ => return Err(InputDeviceError::Other),
        };
        let config = InputConfig {
            sample_rate: supported.sample_rate().0,
            channels: usize::from(supported.channels()),
            sample_format,
        };
        Ok((config, Box::new(CpalInputSession { device })))
    }
}

struct CpalInputSession {
    device: cpal::Device,
}

impl InputDeviceSession for CpalInputSession {
    fn build_input_stream(
        &self,
        config: InputConfig,
        mut on_data: InputDataCallback,
        mut on_error: InputErrorCallback,
    ) -> Result<Box<dyn InputStream>, InputDeviceError> {
        if config.sample_rate == 0 || config.channels == 0 || config.channels > u16::MAX as usize {
            return Err(InputDeviceError::Other);
        }
        let stream_config = cpal::StreamConfig {
            channels: config.channels as u16,
            sample_rate: cpal::SampleRate(config.sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        macro_rules! build_stream {
            ($sample:ty, $variant:ident) => {
                self.device.build_input_stream::<$sample, _, _>(
                    &stream_config,
                    move |data, _| on_data(InputSamples::$variant(data)),
                    move |_| on_error(),
                    None,
                )
            };
        }

        let stream = match config.sample_format {
            InputSampleFormat::I8 => build_stream!(i8, I8),
            InputSampleFormat::I16 => build_stream!(i16, I16),
            InputSampleFormat::I32 => build_stream!(i32, I32),
            InputSampleFormat::I64 => build_stream!(i64, I64),
            InputSampleFormat::U8 => build_stream!(u8, U8),
            InputSampleFormat::U16 => build_stream!(u16, U16),
            InputSampleFormat::U32 => build_stream!(u32, U32),
            InputSampleFormat::U64 => build_stream!(u64, U64),
            InputSampleFormat::F32 => build_stream!(f32, F32),
            InputSampleFormat::F64 => build_stream!(f64, F64),
        }
        .map_err(|error| match error {
            cpal::BuildStreamError::DeviceNotAvailable => InputDeviceError::NoDevice,
            other => classify_open_error(&other.to_string()),
        })?;
        Ok(Box::new(CpalInputStream { stream }))
    }
}

struct CpalInputStream {
    stream: cpal::Stream,
}

impl InputStream for CpalInputStream {
    fn play(&mut self) -> Result<(), InputDeviceError> {
        self.stream.play().map_err(|error| match error {
            cpal::PlayStreamError::DeviceNotAvailable => InputDeviceError::NoDevice,
            other => classify_open_error(&other.to_string()),
        })
    }
}

fn classify_open_error(message: &str) -> InputDeviceError {
    let message = message.to_ascii_lowercase();
    if message.contains("access denied")
        || message.contains("access is denied")
        || message.contains("permission denied")
        || message.contains("e_accessdenied")
        || message.contains("0x80070005")
        || message.contains("-2147024891")
    {
        InputDeviceError::PermissionDenied
    } else {
        InputDeviceError::Other
    }
}

pub struct MicCaptureBackend {
    enabled: Arc<AtomicBool>,
    device: Arc<dyn InputDevice>,
    pending_request: Option<u64>,
    session: Option<CaptureSession>,
    #[cfg(test)]
    wipe_audit: Option<Arc<AtomicBool>>,
}

impl MicCaptureBackend {
    pub fn new(enabled: Arc<AtomicBool>, device: Arc<dyn InputDevice>) -> Self {
        Self {
            enabled,
            device,
            pending_request: None,
            session: None,
            #[cfg(test)]
            wipe_audit: None,
        }
    }

    fn cleanup(&mut self) {
        self.pending_request = None;
        drop(self.session.take());
    }
}

impl VoiceBackend for MicCaptureBackend {
    fn on_press(&mut self, request_id: u64) -> BackendStart {
        self.cleanup();
        if !self.enabled.load(Ordering::Acquire) {
            return BackendStart::Unavailable(TurnReason::MicDisabled);
        }
        self.pending_request = Some(request_id);
        BackendStart::Pending
    }

    fn start_preparing(&mut self, request_id: u64, now_ms: u64) -> BackendProgress {
        if self.pending_request != Some(request_id) {
            return BackendProgress::Unavailable(TurnReason::InputOpenFailed);
        }
        self.pending_request = None;
        if !self.enabled.load(Ordering::Acquire) {
            return BackendProgress::Unavailable(TurnReason::MicDisabled);
        }

        let (sender, receiver) = mpsc::sync_channel(1);
        let (stop_sender, stop_receiver) = mpsc::sync_channel(1);
        let (stopped_sender, stopped_receiver) = mpsc::sync_channel(1);
        let stream_control = StreamControl {
            stop_sender,
            stopped_receiver,
        };
        let cancelled = Arc::new(AtomicBool::new(false));
        let session = CaptureSession::new(
            request_id,
            now_ms,
            Arc::clone(&cancelled),
            receiver,
            stream_control,
            #[cfg(test)]
            self.wipe_audit.clone(),
        );
        let device = Arc::clone(&self.device);
        let worker_cancelled = Arc::clone(&cancelled);
        let started_at = Instant::now();
        let worker = thread::Builder::new()
            .name("g-voice-input-open".to_owned())
            .spawn(move || {
                run_input_worker(
                    device,
                    worker_cancelled,
                    sender,
                    stop_receiver,
                    stopped_sender,
                    started_at,
                );
            });
        match worker {
            Ok(_) => {
                self.session = Some(session);
                BackendProgress::Pending
            }
            Err(_) => {
                drop(session);
                BackendProgress::Unavailable(TurnReason::InputOpenFailed)
            }
        }
    }

    fn poll(&mut self, request_id: u64, now_ms: u64) -> BackendProgress {
        if !self.enabled.load(Ordering::Acquire) {
            self.cleanup();
            return BackendProgress::Unavailable(TurnReason::MicDisabled);
        }
        let Some(session) = self.session.as_mut() else {
            return BackendProgress::Pending;
        };
        if session.request_id != request_id {
            self.cleanup();
            return BackendProgress::Unavailable(TurnReason::InputOpenFailed);
        }
        let progress = session.poll(now_ms);
        if matches!(
            progress,
            BackendProgress::Unavailable(_) | BackendProgress::Failed(_)
        ) {
            self.cleanup();
        }
        progress
    }

    fn on_release(
        &mut self,
        request_id: u64,
        _reason: Option<TurnReason>,
    ) -> Option<BackendFinish> {
        if self
            .session
            .as_ref()
            .is_some_and(|session| session.request_id != request_id)
        {
            return None;
        }
        self.cleanup();
        Some(BackendFinish::Unavailable(TurnReason::SttNotInstalled))
    }

    fn cancel(&mut self, request_id: u64, _reason: TurnReason) {
        if self
            .session
            .as_ref()
            .is_some_and(|session| session.request_id != request_id)
        {
            return;
        }
        self.cleanup();
    }
}

impl Drop for MicCaptureBackend {
    fn drop(&mut self) {
        self.cleanup();
    }
}

struct TimedOpenResult {
    result: Result<OpenedInput, InputDeviceError>,
    elapsed: Duration,
}

struct StreamControl {
    stop_sender: mpsc::SyncSender<()>,
    stopped_receiver: Receiver<()>,
}

impl StreamControl {
    fn stop(&self) {
        let _ = self.stop_sender.try_send(());
        let _ = self
            .stopped_receiver
            .recv_timeout(Duration::from_millis(90));
    }
}

struct WorkerStopped(mpsc::SyncSender<()>);

impl Drop for WorkerStopped {
    fn drop(&mut self) {
        let _ = self.0.try_send(());
    }
}

struct OpenedInput {
    config: InputConfig,
    ring: Arc<SampleRing>,
    lost: Arc<AtomicBool>,
}

fn run_input_worker(
    device: Arc<dyn InputDevice>,
    cancelled: Arc<AtomicBool>,
    sender: mpsc::SyncSender<TimedOpenResult>,
    stop_receiver: Receiver<()>,
    stopped_sender: mpsc::SyncSender<()>,
    started_at: Instant,
) {
    let _stopped = WorkerStopped(stopped_sender);
    let (opened, mut stream) = match open_input_stream(device, Arc::clone(&cancelled)) {
        Ok(opened) => opened,
        Err(error) => {
            if !cancelled.load(Ordering::Acquire) {
                let _ = sender.send(TimedOpenResult {
                    result: Err(error),
                    elapsed: started_at.elapsed(),
                });
            }
            return;
        }
    };
    if cancelled.load(Ordering::Acquire) {
        return;
    }
    if let Err(error) = stream.play() {
        if !cancelled.load(Ordering::Acquire) {
            let _ = sender.send(TimedOpenResult {
                result: Err(error),
                elapsed: started_at.elapsed(),
            });
        }
        return;
    }
    if cancelled.load(Ordering::Acquire) {
        return;
    }

    let sent = sender
        .send(TimedOpenResult {
            result: Ok(opened),
            elapsed: started_at.elapsed(),
        })
        .is_ok();
    if sent {
        let _ = stop_receiver.recv();
    }
    drop(stream);
}

fn open_input_stream(
    device: Arc<dyn InputDevice>,
    cancelled: Arc<AtomicBool>,
) -> Result<(OpenedInput, Box<dyn InputStream>), InputDeviceError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(InputDeviceError::Other);
    }
    let (config, input_session) = device.default_input_config()?;
    if cancelled.load(Ordering::Acquire) {
        return Err(InputDeviceError::Other);
    }
    let ring = Arc::new(SampleRing::new(config)?);
    let lost = Arc::new(AtomicBool::new(false));
    let callback_ring = Arc::clone(&ring);
    let callback_cancelled = Arc::clone(&cancelled);
    let error_cancelled = Arc::clone(&cancelled);
    let callback_lost = Arc::clone(&lost);
    let on_data: InputDataCallback = Box::new(move |samples| {
        if !callback_cancelled.load(Ordering::Acquire) {
            callback_ring.push_samples(samples);
        }
    });
    let on_error: InputErrorCallback = Box::new(move || {
        if !error_cancelled.load(Ordering::Acquire) {
            callback_lost.store(true, Ordering::Release);
        }
    });
    let stream = input_session.build_input_stream(config, on_data, on_error)?;
    if cancelled.load(Ordering::Acquire) {
        return Err(InputDeviceError::Other);
    }
    Ok((OpenedInput { config, ring, lost }, stream))
}

struct CaptureSession {
    request_id: u64,
    preparing_at_ms: u64,
    cancelled: Arc<AtomicBool>,
    open_receiver: Option<Receiver<TimedOpenResult>>,
    stream_control: StreamControl,
    ring: Option<Arc<SampleRing>>,
    lost: Option<Arc<AtomicBool>>,
    converter: Option<PcmConverter>,
    buffer: CaptureBuffer,
}

impl CaptureSession {
    fn new(
        request_id: u64,
        preparing_at_ms: u64,
        cancelled: Arc<AtomicBool>,
        open_receiver: Receiver<TimedOpenResult>,
        stream_control: StreamControl,
        #[cfg(test)] wipe_audit: Option<Arc<AtomicBool>>,
    ) -> Self {
        #[cfg(test)]
        if let Some(audit) = wipe_audit {
            return Self::new_with_test_buffer(
                request_id,
                preparing_at_ms,
                cancelled,
                open_receiver,
                stream_control,
                audit,
            );
        }
        Self {
            request_id,
            preparing_at_ms,
            cancelled,
            open_receiver: Some(open_receiver),
            stream_control,
            ring: None,
            lost: None,
            converter: None,
            buffer: CaptureBuffer::new(),
        }
    }

    #[cfg(test)]
    fn new_with_test_buffer(
        request_id: u64,
        preparing_at_ms: u64,
        cancelled: Arc<AtomicBool>,
        open_receiver: Receiver<TimedOpenResult>,
        stream_control: StreamControl,
        audit: Arc<AtomicBool>,
    ) -> Self {
        Self {
            request_id,
            preparing_at_ms,
            cancelled,
            open_receiver: Some(open_receiver),
            stream_control,
            ring: None,
            lost: None,
            converter: None,
            buffer: CaptureBuffer::with_test_audit(audit),
        }
    }

    fn poll(&mut self, now_ms: u64) -> BackendProgress {
        if self.ring.is_none() {
            let result = self
                .open_receiver
                .as_ref()
                .map_or(Err(TryRecvError::Disconnected), Receiver::try_recv);
            match result {
                Ok(timed) => {
                    drop(self.open_receiver.take());
                    if timed.elapsed > Duration::from_millis(INPUT_OPEN_TIMEOUT_MS) {
                        self.cancelled.store(true, Ordering::Release);
                        drop(timed);
                        return BackendProgress::Unavailable(TurnReason::InputOpenFailed);
                    }
                    match timed.result {
                        Ok(opened) => {
                            self.ring = Some(opened.ring);
                            self.lost = Some(opened.lost);
                            self.converter = Some(PcmConverter::new(opened.config));
                            return BackendProgress::Ready;
                        }
                        Err(error) => return open_error_progress(error),
                    }
                }
                Err(TryRecvError::Empty)
                    if now_ms.saturating_sub(self.preparing_at_ms) < INPUT_OPEN_TIMEOUT_MS =>
                {
                    return BackendProgress::Pending;
                }
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => {
                    return BackendProgress::Unavailable(TurnReason::InputOpenFailed);
                }
            }
        }

        if self
            .lost
            .as_ref()
            .is_some_and(|lost| lost.load(Ordering::Acquire))
        {
            return BackendProgress::Failed(TurnReason::InputDeviceLost);
        }
        if let (Some(ring), Some(converter)) = (&self.ring, &mut self.converter) {
            converter.drain(ring, &mut self.buffer);
        }
        if self.buffer.is_full() {
            return BackendProgress::HoldCap;
        }
        BackendProgress::Pending
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        drop(self.open_receiver.take());
        self.stream_control.stop();
        self.buffer.zero();
    }
}

fn open_error_progress(error: InputDeviceError) -> BackendProgress {
    let reason = match error {
        InputDeviceError::NoDevice => TurnReason::NoInputDevice,
        InputDeviceError::PermissionDenied => TurnReason::MicPermissionDenied,
        InputDeviceError::Other => TurnReason::InputOpenFailed,
    };
    BackendProgress::Unavailable(reason)
}

struct CaptureBuffer {
    bytes: Box<[u8]>,
    len: usize,
    #[cfg(test)]
    wipe_audit: Option<Arc<AtomicBool>>,
}

impl CaptureBuffer {
    fn new() -> Self {
        Self {
            bytes: vec![0; CAPTURE_BUFFER_BYTES].into_boxed_slice(),
            len: 0,
            #[cfg(test)]
            wipe_audit: None,
        }
    }

    #[cfg(test)]
    fn with_test_audit(wipe_audit: Arc<AtomicBool>) -> Self {
        Self {
            bytes: vec![0; CAPTURE_BUFFER_BYTES].into_boxed_slice(),
            len: 0,
            wipe_audit: Some(wipe_audit),
        }
    }

    #[cfg(test)]
    fn capacity_bytes(&self) -> usize {
        self.bytes.len()
    }

    #[cfg(test)]
    fn len_bytes(&self) -> usize {
        self.len
    }

    #[cfg(test)]
    fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len]
    }

    fn is_full(&self) -> bool {
        self.len == self.bytes.len()
    }

    fn write_i16(&mut self, sample: i16) {
        if self.bytes.len().saturating_sub(self.len) < 2 {
            return;
        }
        self.bytes[self.len..self.len + 2].copy_from_slice(&sample.to_le_bytes());
        self.len += 2;
    }

    fn zero(&mut self) {
        for byte in self.bytes.iter_mut() {
            // Volatile writes keep the privacy wipe observable to the allocator boundary.
            unsafe { std::ptr::write_volatile(byte, 0) };
        }
        std::sync::atomic::compiler_fence(Ordering::SeqCst);
        self.len = 0;
    }
}

impl Drop for CaptureBuffer {
    fn drop(&mut self) {
        self.zero();
        #[cfg(test)]
        if let Some(audit) = &self.wipe_audit {
            audit.store(self.bytes.iter().all(|byte| *byte == 0), Ordering::Release);
        }
    }
}

struct SampleRing {
    samples: Box<[UnsafeCell<f32>]>,
    channels: usize,
    frame_capacity: usize,
    write_frame: AtomicUsize,
    read_frame: AtomicUsize,
}

// The cpal callback is the sole producer and the VoiceTurn monitor is the sole consumer.
// SAFETY: atomic publication keeps each slot owned by one side until the consumer releases it.
unsafe impl Send for SampleRing {}
// SAFETY: shared access is limited to that single-producer/single-consumer hand-off.
unsafe impl Sync for SampleRing {}

impl SampleRing {
    fn new(config: InputConfig) -> Result<Self, InputDeviceError> {
        if config.sample_rate == 0 || config.channels == 0 {
            return Err(InputDeviceError::Other);
        }
        let max_frames_by_samples = RING_MAX_SAMPLES / config.channels;
        let frame_capacity = (config.sample_rate as usize)
            .min(RING_MAX_FRAMES)
            .min(max_frames_by_samples);
        if frame_capacity == 0 {
            return Err(InputDeviceError::Other);
        }
        let samples = (0..frame_capacity * config.channels)
            .map(|_| UnsafeCell::new(0.0))
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Ok(Self {
            samples,
            channels: config.channels,
            frame_capacity,
            write_frame: AtomicUsize::new(0),
            read_frame: AtomicUsize::new(0),
        })
    }

    fn push_samples(&self, samples: InputSamples<'_>) {
        match samples {
            InputSamples::I8(samples) => self.push_typed(samples),
            InputSamples::I16(samples) => self.push_typed(samples),
            InputSamples::I32(samples) => self.push_typed(samples),
            InputSamples::I64(samples) => self.push_typed(samples),
            InputSamples::U8(samples) => self.push_typed(samples),
            InputSamples::U16(samples) => self.push_typed(samples),
            InputSamples::U32(samples) => self.push_typed(samples),
            InputSamples::U64(samples) => self.push_typed(samples),
            InputSamples::F32(samples) => self.push_typed(samples),
            InputSamples::F64(samples) => self.push_typed(samples),
        }
    }

    fn push_typed<T>(&self, samples: &[T])
    where
        T: Sample + Copy,
        f32: FromSample<T>,
    {
        for frame in samples.chunks_exact(self.channels) {
            let write = self.write_frame.load(Ordering::Relaxed);
            let read = self.read_frame.load(Ordering::Acquire);
            if write.wrapping_sub(read) >= self.frame_capacity {
                continue;
            }
            let slot = (write % self.frame_capacity) * self.channels;
            for (channel, sample) in frame.iter().enumerate() {
                let converted: f32 = sample.to_sample();
                unsafe { *self.samples[slot + channel].get() = converted };
            }
            self.write_frame
                .store(write.wrapping_add(1), Ordering::Release);
        }
    }

    fn pop_frame(&self, frame: &mut [f32]) -> bool {
        if frame.len() != self.channels {
            return false;
        }
        let read = self.read_frame.load(Ordering::Relaxed);
        let write = self.write_frame.load(Ordering::Acquire);
        if read == write {
            return false;
        }
        let slot = (read % self.frame_capacity) * self.channels;
        for (channel, sample) in frame.iter_mut().enumerate() {
            *sample = unsafe { *self.samples[slot + channel].get() };
        }
        self.read_frame
            .store(read.wrapping_add(1), Ordering::Release);
        true
    }

    #[cfg(test)]
    fn push_frame(&self, frame: &[f32]) {
        if frame.len() != self.channels {
            return;
        }
        let write = self.write_frame.load(Ordering::Relaxed);
        let read = self.read_frame.load(Ordering::Acquire);
        if write.wrapping_sub(read) >= self.frame_capacity {
            return;
        }
        let slot = (write % self.frame_capacity) * self.channels;
        for (channel, sample) in frame.iter().enumerate() {
            unsafe { *self.samples[slot + channel].get() = *sample };
        }
        self.write_frame
            .store(write.wrapping_add(1), Ordering::Release);
    }

    fn zero(&self) {
        for sample in self.samples.iter() {
            unsafe { std::ptr::write_volatile(sample.get(), 0.0) };
        }
        std::sync::atomic::compiler_fence(Ordering::SeqCst);
        self.read_frame.store(0, Ordering::Release);
        self.write_frame.store(0, Ordering::Release);
    }
}

impl Drop for SampleRing {
    fn drop(&mut self) {
        self.zero();
    }
}

struct PcmConverter {
    sample_rate: u32,
    frame: Vec<f32>,
    previous: Option<f32>,
    input_frames: u64,
    next_output_frame: f64,
}

impl PcmConverter {
    fn new(config: InputConfig) -> Self {
        Self {
            sample_rate: config.sample_rate,
            frame: vec![0.0; config.channels],
            previous: None,
            input_frames: 0,
            next_output_frame: 0.0,
        }
    }

    fn drain(&mut self, ring: &SampleRing, output: &mut CaptureBuffer) {
        while !output.is_full() && ring.pop_frame(&mut self.frame) {
            self.convert_frame(output);
        }
    }

    fn convert_frame(&mut self, output: &mut CaptureBuffer) {
        let mono = self.frame.iter().copied().sum::<f32>() / self.frame.len() as f32;
        let current_index = self.input_frames as f64;
        match self.previous {
            None => {
                output.write_i16(float_to_i16(mono));
                self.next_output_frame = self.sample_rate as f64 / CAPTURE_SAMPLE_RATE as f64;
            }
            Some(previous) => {
                let previous_index = current_index - 1.0;
                let step = self.sample_rate as f64 / CAPTURE_SAMPLE_RATE as f64;
                while self.next_output_frame <= current_index && !output.is_full() {
                    let fraction = (self.next_output_frame - previous_index).clamp(0.0, 1.0);
                    let sample = previous + (mono - previous) * fraction as f32;
                    output.write_i16(float_to_i16(sample));
                    self.next_output_frame += step;
                }
            }
        }
        self.previous = Some(mono);
        self.input_frames = self.input_frames.saturating_add(1);
    }
}

impl Drop for PcmConverter {
    fn drop(&mut self) {
        for sample in &mut self.frame {
            unsafe { std::ptr::write_volatile(sample, 0.0) };
        }
        if let Some(previous) = &mut self.previous {
            unsafe { std::ptr::write_volatile(previous, 0.0) };
        }
        std::sync::atomic::compiler_fence(Ordering::SeqCst);
        self.previous = None;
    }
}

fn float_to_i16(sample: f32) -> i16 {
    let sample = if sample.is_finite() {
        sample.clamp(-1.0, 1.0)
    } else {
        0.0
    };
    if sample <= -1.0 {
        i16::MIN
    } else {
        (sample * i16::MAX as f32).round() as i16
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice_turn::{critical_preempt, TurnReason, VoiceState, VoiceTurn, VoiceTurnEvent};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Condvar, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    const TEST_CONFIG: InputConfig = InputConfig {
        sample_rate: 48_000,
        channels: 2,
        sample_format: InputSampleFormat::F32,
    };

    #[test]
    fn mic_enabled_setting_reads_nested_voice_value_and_defaults_off() {
        assert!(!mic_enabled_from_settings(None));
        assert!(!mic_enabled_from_settings(Some("{}")));
        assert!(mic_enabled_from_settings(Some(
            r#"{"voice":{"micEnabled":true}}"#
        )));
        assert!(!mic_enabled_from_settings(Some(
            r#"{"voice":{"micEnabled":"true"}}"#
        )));
    }

    #[derive(Default)]
    struct OpenGate {
        entered: AtomicBool,
        released: Mutex<bool>,
        changed: Condvar,
    }

    impl OpenGate {
        fn wait_until_entered(&self) {
            let deadline = Instant::now() + Duration::from_millis(500);
            while !self.entered.load(Ordering::Acquire) && Instant::now() < deadline {
                thread::yield_now();
            }
            assert!(self.entered.load(Ordering::Acquire));
        }

        fn release(&self) {
            *self.released.lock().unwrap() = true;
            self.changed.notify_all();
        }

        fn wait(&self) {
            let mut released = self.released.lock().unwrap();
            while !*released {
                released = self.changed.wait(released).unwrap();
            }
        }
    }

    #[derive(Default)]
    struct FakeState {
        config_error: Mutex<Option<InputDeviceError>>,
        build_error: Mutex<Option<InputDeviceError>>,
        play_error: Mutex<Option<InputDeviceError>>,
        gate: Mutex<Option<Arc<OpenGate>>>,
        default_queries: AtomicUsize,
        build_attempts: AtomicUsize,
        play_attempts: AtomicUsize,
        stream_drops: AtomicUsize,
        callbacks: Mutex<Option<(InputDataCallback, InputErrorCallback)>>,
    }

    impl FakeState {
        fn fail_next_build(&self, error: InputDeviceError) {
            *self.build_error.lock().unwrap() = Some(error);
        }

        fn fail_next_play(&self, error: InputDeviceError) {
            *self.play_error.lock().unwrap() = Some(error);
        }

        fn gate_open(&self) -> Arc<OpenGate> {
            let gate = Arc::new(OpenGate::default());
            *self.gate.lock().unwrap() = Some(Arc::clone(&gate));
            gate
        }

        fn send_samples(&self, data: InputSamples<'_>) {
            let mut callbacks = self.callbacks.lock().unwrap();
            let (on_data, _) = callbacks.as_mut().expect("input stream is active");
            on_data(data);
        }

        fn lose_device(&self) {
            let mut callbacks = self.callbacks.lock().unwrap();
            let (_, on_error) = callbacks.as_mut().expect("input stream is active");
            on_error();
        }
    }

    struct FakeInputDevice(Arc<FakeState>);

    impl InputDevice for FakeInputDevice {
        fn default_input_config(
            &self,
        ) -> Result<(InputConfig, Box<dyn InputDeviceSession>), InputDeviceError> {
            self.0.default_queries.fetch_add(1, Ordering::AcqRel);
            if let Some(error) = *self.0.config_error.lock().unwrap() {
                return Err(error);
            }
            Ok((TEST_CONFIG, Box::new(FakeInputSession(Arc::clone(&self.0)))))
        }
    }

    struct FakeInputSession(Arc<FakeState>);

    impl InputDeviceSession for FakeInputSession {
        fn build_input_stream(
            &self,
            _config: InputConfig,
            on_data: InputDataCallback,
            on_error: InputErrorCallback,
        ) -> Result<Box<dyn InputStream>, InputDeviceError> {
            self.0.build_attempts.fetch_add(1, Ordering::AcqRel);
            if let Some(gate) = self.0.gate.lock().unwrap().clone() {
                gate.entered.store(true, Ordering::Release);
                gate.wait();
            }
            if let Some(error) = self.0.build_error.lock().unwrap().take() {
                return Err(error);
            }
            *self.0.callbacks.lock().unwrap() = Some((on_data, on_error));
            Ok(Box::new(FakeInputStream(Arc::clone(&self.0))))
        }
    }

    struct FakeInputStream(Arc<FakeState>);

    impl InputStream for FakeInputStream {
        fn play(&mut self) -> Result<(), InputDeviceError> {
            self.0.play_attempts.fetch_add(1, Ordering::AcqRel);
            if let Some(error) = self.0.play_error.lock().unwrap().take() {
                return Err(error);
            }
            Ok(())
        }
    }

    impl Drop for FakeInputStream {
        fn drop(&mut self) {
            drop(self.0.callbacks.lock().unwrap().take());
            self.0.stream_drops.fetch_add(1, Ordering::AcqRel);
        }
    }

    fn test_backend(
        enabled: bool,
        state: &Arc<FakeState>,
        wiped: &Arc<AtomicBool>,
    ) -> MicCaptureBackend {
        let mut backend = MicCaptureBackend::new(
            Arc::new(AtomicBool::new(enabled)),
            Arc::new(FakeInputDevice(Arc::clone(state))),
        );
        backend.wipe_audit = Some(Arc::clone(wiped));
        backend
    }

    fn next_progress(turn: &mut VoiceTurn, now_ms: u64) -> Vec<VoiceTurnEvent> {
        let deadline = Instant::now() + Duration::from_millis(500);
        loop {
            let events = turn.tick_at(now_ms);
            if !events.is_empty() {
                return events;
            }
            assert!(
                Instant::now() < deadline,
                "capture worker did not report progress"
            );
            thread::sleep(Duration::from_millis(1));
        }
    }

    fn start_listening(state: &Arc<FakeState>, wiped: &Arc<AtomicBool>) -> VoiceTurn {
        let mut turn = VoiceTurn::new(test_backend(true, state, wiped));
        let pressed = turn.press_at(0);
        assert_eq!(pressed.len(), 1);
        assert_eq!(pressed[0].state, VoiceState::Preparing);
        let listening = next_progress(&mut turn, 1);
        assert_eq!(listening.len(), 1);
        assert_eq!(listening[0].state, VoiceState::Listening);
        turn
    }

    #[test]
    fn mic_disabled_does_not_open_the_default_input_device() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(false, &state, &wiped));

        let events = turn.press_at(10);

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::MicDisabled));
        assert_eq!(state.default_queries.load(Ordering::Acquire), 0);
        assert_eq!(state.build_attempts.load(Ordering::Acquire), 0);
    }

    #[test]
    fn missing_default_device_reports_no_input_device() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        *state.config_error.lock().unwrap() = Some(InputDeviceError::NoDevice);
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(true, &state, &wiped));

        assert_eq!(turn.press_at(0)[0].state, VoiceState::Preparing);
        let events = next_progress(&mut turn, 1);

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::NoInputDevice));
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn stream_open_failure_reports_input_open_failed() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        state.fail_next_build(InputDeviceError::Other);
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(true, &state, &wiped));

        assert_eq!(turn.press_at(0)[0].state, VoiceState::Preparing);
        let events = next_progress(&mut turn, 1);

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::InputOpenFailed));
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn stream_start_failure_reports_input_open_failed() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        state.fail_next_play(InputDeviceError::Other);
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(true, &state, &wiped));

        assert_eq!(turn.press_at(0)[0].state, VoiceState::Preparing);
        let events = next_progress(&mut turn, 1);

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::InputOpenFailed));
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn access_denied_reports_mic_permission_denied() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        state.fail_next_build(InputDeviceError::PermissionDenied);
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(true, &state, &wiped));

        assert_eq!(turn.press_at(0)[0].state, VoiceState::Preparing);
        let events = next_progress(&mut turn, 1);

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::MicPermissionDenied));
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn preparing_times_out_after_two_seconds_and_cancels_the_open_attempt() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let gate = state.gate_open();
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = VoiceTurn::new(test_backend(true, &state, &wiped));

        assert_eq!(turn.press_at(0)[0].state, VoiceState::Preparing);
        gate.wait_until_entered();
        assert!(turn.tick_at(1_999).is_empty());
        let events = turn.tick_at(2_000);
        gate.release();

        assert_eq!(events[0].state, VoiceState::Unavailable);
        assert_eq!(events[0].reason, Some(TurnReason::InputOpenFailed));
        assert!(wiped.load(Ordering::Acquire));
        let deadline = Instant::now() + Duration::from_millis(500);
        while state.stream_drops.load(Ordering::Acquire) == 0 && Instant::now() < deadline {
            thread::yield_now();
        }
        assert_eq!(state.play_attempts.load(Ordering::Acquire), 0);
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
    }

    #[test]
    fn release_drops_stream_within_100ms_zeroes_buffer_and_finishes_without_stt() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = start_listening(&state, &wiped);
        state.send_samples(InputSamples::F32(&[0.25, 0.25, -0.25, -0.25]));
        assert!(turn.tick_at(2).is_empty());

        let started = Instant::now();
        let events = turn.release_at(300);
        let elapsed = started.elapsed();

        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(elapsed <= Duration::from_millis(100));
        assert!(wiped.load(Ordering::Acquire));
        assert_eq!(
            events.iter().map(|event| event.state).collect::<Vec<_>>(),
            [
                VoiceState::Decoding,
                VoiceState::Unavailable,
                VoiceState::Idle,
            ]
        );
        assert_eq!(events[1].reason, Some(TurnReason::SttNotInstalled));
    }

    #[test]
    fn capture_buffer_stays_at_480000_bytes_after_more_than_fifteen_seconds() {
        let _serial = crate::voice_turn::serial_turn_test();
        let wiped = Arc::new(AtomicBool::new(false));
        let mut buffer = CaptureBuffer::with_test_audit(Arc::clone(&wiped));
        let original_capacity = buffer.capacity_bytes();
        let output_samples = 16_000 * 20;

        for _ in 0..output_samples {
            buffer.write_i16(12_345);
        }

        assert_eq!(original_capacity, 480_000);
        assert_eq!(buffer.capacity_bytes(), original_capacity);
        assert_eq!(buffer.len_bytes(), 480_000);
        assert!(buffer.is_full());
        drop(buffer);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn device_loss_fails_the_turn_and_zeroes_capture() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = start_listening(&state, &wiped);
        state.send_samples(InputSamples::F32(&[0.5, 0.5]));
        assert!(turn.tick_at(2).is_empty());
        state.lose_device();

        let events = next_progress(&mut turn, 3);

        assert_eq!(events[0].state, VoiceState::Failed);
        assert_eq!(events[0].reason, Some(TurnReason::InputDeviceLost));
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn stereo_48khz_sine_is_downmixed_and_resampled_to_mono_16khz() {
        let config = TEST_CONFIG;
        let ring = SampleRing::new(config).unwrap();
        let mut buffer = CaptureBuffer::new();
        let mut converter = PcmConverter::new(config);

        for frame in 0..48_000 {
            let sample = (std::f32::consts::TAU * 440.0 * frame as f32 / 48_000.0).sin() * 0.5;
            ring.push_frame(&[sample, sample]);
        }
        converter.drain(&ring, &mut buffer);

        assert_eq!(buffer.len_bytes(), 16_000 * 2);
        let rms = (buffer
            .as_bytes()
            .chunks_exact(2)
            .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]) as f64 / i16::MAX as f64)
            .map(|sample| sample * sample)
            .sum::<f64>()
            / 16_000.0)
            .sqrt();
        let expected_rms = 0.5 / 2.0_f64.sqrt();
        assert!((rms / expected_rms - 1.0).abs() <= 0.02);
    }

    #[test]
    fn signal_preempt_during_listening_drops_stream_and_zeroes_capture() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = start_listening(&state, &wiped);
        state.send_samples(InputSamples::F32(&[0.4, 0.4, 0.4, 0.4]));
        assert!(turn.tick_at(1).is_empty());
        critical_preempt();

        let events = turn.tick_at(2);

        assert_eq!(events[0].state, VoiceState::Cancelled);
        assert_eq!(events[0].reason, Some(TurnReason::SignalPreempt));
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn user_cancel_during_listening_drops_stream_and_zeroes_capture() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = start_listening(&state, &wiped);
        state.send_samples(InputSamples::F32(&[0.4, 0.4, 0.4, 0.4]));
        assert!(turn.tick_at(1).is_empty());

        let events = turn.cancel(TurnReason::TooShort, 2);

        assert_eq!(events[0].state, VoiceState::Cancelled);
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn app_exit_during_listening_drops_stream_and_zeroes_capture() {
        let _serial = crate::voice_turn::serial_turn_test();
        let state = Arc::new(FakeState::default());
        let wiped = Arc::new(AtomicBool::new(false));
        let mut turn = start_listening(&state, &wiped);
        state.send_samples(InputSamples::F32(&[0.4, 0.4, 0.4, 0.4]));
        assert!(turn.tick_at(1).is_empty());

        let events = turn.cancel(TurnReason::AppExit, 2);

        assert_eq!(events[0].state, VoiceState::Cancelled);
        assert_eq!(events[0].reason, Some(TurnReason::AppExit));
        assert_eq!(state.stream_drops.load(Ordering::Acquire), 1);
        assert!(wiped.load(Ordering::Acquire));
    }

    #[test]
    fn capture_module_imports_no_file_or_network_apis() {
        let source = include_str!("voice_capture.rs");
        let imports = source
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("use "))
            .collect::<Vec<_>>()
            .join("\n");

        for forbidden in [
            "std::fs",
            "reqwest",
            "axum",
            "tokio::net",
            "TcpStream",
            "UdpSocket",
        ] {
            assert!(
                !imports.contains(forbidden),
                "unexpected capture import: {forbidden}"
            );
        }
    }
}
