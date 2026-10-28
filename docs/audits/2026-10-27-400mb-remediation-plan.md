---
title: "G-Maiden — Keep 400 MB Native Remediation"
doc_id: "PLAN-KEEP400-NATIVE-20261027"
status: superseded
version: "0.10.1"
updated: "2026-10-28"
owner: "G-Maiden"
approved_by: "Owner selected keep 400 MB and reduce RAM in this chat"
related_docs: ["mvp-decisions", "PLAN-P1-REMEDIATION-20261027", "PROPOSAL-RAM-BUDGET-20261027"]
---

# ลดการใช้ RAM โดยคง 400 MB

**Current MVP decision:900,000,000bytes aggregate Working Set** per owner instruction and [[mvp-decisions]] v0.5.0. Earlier400/800MB statements below are historical; no old result is reclassified as900MB acceptance. Continue event corrections per [[PLAN-MVP-EVENT-CORRECTIONS-20261028]].

**Superseded by owner instruction2026-10-28: “เพิ่มramจาก400เป็น 800”.** เป้าปัจจุบันคือ800,000,000bytesตาม [[mvp-decisions]] v0.4.0. เอกสารนี้เก็บการทดลองและผลล้มเหลวภายใต้400MBเดิม; ไม่อ้างว่าบรรลุ400MBและไม่เปลี่ยนผลย้อนหลังให้ผ่าน800MB. การปรับภาพ/ฟอนต์/blurเพิ่มเติมยังไม่ได้ทำ.

Owner เลือกคง **400,000,000 bytes peak aggregate Working Set** และให้ลด RAM ต่อ. ทางเลือกเพิ่มเป็น 1,000 MB ไม่ได้รับอนุมัติ. ทุก PID ที่ใช้งานยังถูกนับ; ไม่เปลี่ยนเป็น private bytes, ไม่ยกเว้น WebView/model, ไม่สั่ง trim working set เพื่อให้ metric ดูผ่าน.

## Baseline

GUI subsystem แก้สมาชิก process group ได้ 9/9 แล้ว; WebView2 LOW target ใช้ได้ทั้งสองหน้าต่าง. Native diagnostic 5 samples วัด485.5–494.6 MB และต่อมามีค่าเกิน500 MB; CPUช่วงสั้น0.37–1.73% บน12 logicalcores. ยังไม่ผ่านRAMและยังไม่ใช่ sustained acceptance.

## Bounded execution

1. **แยกต้นทุนก่อนแก้:** C ตรวจ native resident mapping/แต่ละPID โดยไม่อ่าน rawmemory หรือแตะเกม; A ตรวจ state/listener/blob/image lifecycle; B ตรวจ lifecycle API ของ hidden control. ทุกคนเริ่ม read-only.
2. **Optimized local debug experiment (parent):** compileเฉพาะ app package ที่ opt-level2 โดยยังคงdebug assertions/overflow checks/local authoring policy. ไม่เปลี่ยนvoicepack/Store receipts/เงื่อนไขCV/งบresource. รันnative tests/Clippy/buildในprofileเดียวกันก่อนวัด; เก็บcommand/config/hash/PIDs. ใช้sharedtargetแต่serializeCargo.
3. **แก้เฉพาะสาเหตุที่พิสูจน์ได้:** Root opt2 วัด own-image residency ลด6.76MB และhostลด8.49MB จึงคงopt-level2เฉพาะapp packageในdev profile; debug assertionsและauthoring policyยังเดิม. Frontendแก้exactidle heartbeat no-opและlateasyncunlisten4จุดที่มีRED/GREEN พร้อมรักษาreceiptage/expiryทั้งหมด. ทดสอบcombinedcandidateใหม่ก่อนสรุปRAM.

4. **อ่านheap/frame metadataก่อนเลือกarchitecture:** เพิ่มlocal bounded sampler20s×12rounds ใช้เฉพาะ Runtime.getHeapUsage และframe/processmetadata; allowlistเฉพาะwindowlabel/PID/frameID/ตัวเลขheap ไม่lograwresponses/URLs ไม่เปิดremoteport ไม่evaluateJavaScript/ทำheapdump/สั่งGC. เกณฑ์RAMยังใช้nativeaggregateWSเท่านั้น. BrowserGC/process flagsไม่ใช่solutionที่จะส่งในproductionตามคำแนะนำMicrosoft จึงไม่ใช้เป็นทางลัด. หากต้องทดลองpopup/openerเพื่อลดrenderer ต้องdocument/reviewtrust+recoveryและพิสูจน์IPC/labels/ทั้งสองUIก่อนadoption.

อ้างอิง: [Microsoft WebView2 browser flags](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags) ระบุว่าไม่ควรใช้browser flagsในproductionเพราะอาจเปลี่ยนหรือเลิกได้. ไม่มีflagดังกล่าวถูกเพิ่มในcandidateเหล่านี้.

5. **แก้ขั้นถัดไปจากหลักฐาน:** เลือก leak/lifecycle/retained-resource fixes จากหลักฐานก่อน implementation. ล้างเฉพาะcacheที่สร้างใหม่ได้และคืนทรัพยากรเมื่อไม่จำเป็น โดยรักษาการกลับมาเปิดUIและsettingsอย่างถูกต้อง. ไม่ปิดCVหรือฟีเจอร์เพื่อทำให้ดูผ่าน.

   **Formatter allocation:** source trace พบว่า `resource-stats` ทุกsampleเรียก `buildHistory` และ `Date.toLocaleString` พร้อมoptionsซ้ำถึง12แถว ทั้งที่logsเดิม. Heap-onlydiagnosticอ่านJSusedประมาณ7MB แต่nativeaggregateWSแกว่งประมาณ660MBก่อนลดลง281MB; ยังไม่ใช่หลักฐานcausalของformatter. ทำboundedRED/GREENเพื่อreuseการformat/cacheเฉพาะinputเดิม โดยรักษาข้อความ/locale/timezone/invalid-date semantics. เปรียบเทียบnativeก่อน/หลังหลังwarmup; หากไม่ลดจริงห้ามอ้างว่าแก้RAMแล้ว. ไม่เปลี่ยนtelemetrycadenceหรือfreshness.

   **Diagnostic fault:** simultaneousheap+frame/processmetadataสองครั้งล้มในinstalledWebView2ก่อนcallbacks. Heap-onlyrequestผ่านและอ่านค่าได้ จึงแยกmappingออกก่อน; ยังไม่สรุปdefectในRustABIหรือWebView2. ไม่ใช้candidateที่ล้มเป็นbuildพร้อมทดสอบ.
6. **Native verification:** เปิดcandidateที่ยืนยันoriginal15WAV/13events; ตรวจexactJobmembership/aggregateCPU/RAMหลังwarmupโดยไม่ปิดDotaหรือส่งgameinput. หากยังเกิน400MB ให้คงreadinesswithdrawalและทำขั้นถัดไป; ห้ามอ้างว่าพร้อม.

Fullidle/liveCV/Voice+Signal/FPS/acoustic acceptance matrixยังเป็นอีกgate; shortnative samplesให้ได้เพียงdiagnosticผลก่อน/หลัง.

## Follow-up after formatter comparison

Formatter9focusedtestsและfullfrontend363testsผ่าน; native454/7ignored, Clippy/TSC/ESLintและTaurismokebuildผ่าน. Heap-onlydiagnosticsทำงานต่อเนื่องโดยไม่คืนfaultingframe/processmapping. CandidatePID15520initialJob10/10, after269s startup31samples:30completeRAM467.30–491.24MBและ1unavailableจากNVSMIเกิดระหว่างmembershipsnapshots. PreciseCPUquerytimingให้max2.61% ในช่วงสั้น. หยุดrun601ที่31เพราะRAMfailแล้ว; **10นาทีไม่ครบและยังไม่ผ่าน400MB**. Rendererโตน้อยลง แต่ไม่อ้างcausalRAMsavingจากช่วงGCต่างกัน.

ขั้นต่อไปที่อยู่ในownerreduce-RAMscope:

1. [Related-WebView experiment](2026-10-28-related-webviews-memory-spike.md): document/reviewtrust+navigation+hydratedreadinessก่อนcode. ใช้supportedopenerenvironmentเพื่อทดลองrendererร่วมกัน; ไม่รับรองsharingหรือadoptionจากbuilderสำเร็จ.
2. NativeDota process detection: receiptพบ`tasklist.exe`+conhostรวมประมาณ21.1MBชั่วคราวจากwatchdog. ใช้Toolhelpprocess-namesnapshotแทนspawncommand; รักษาOption<bool> โดยfailure=unknownและabsence=falseเฉพาะenumerationสำเร็จ. Readonlymetadataเท่านั้น, ไม่OpenProcessอ่านเกม. Snapshot/iterationerrorsและexactcase-insensitivenameต้องมีRED/GREEN; registry`reg`path/F01cfgunchanged. นี่ลดtransientcostที่วัดได้ ไม่อ้างว่าจะลดsteady472MBด้วยตัวเดียว.

## Ten-minute related-view result and next measured fix

Related-view candidatePID26484ผ่าน471Rust/7ignoredและ384frontendtests, ทั้งสองnativewindowsloadedและOverlayACKready, browserPID17676เดียวกันและexactJob8/8มีrenderer22256เพียงตัวเดียว. ControlUIตรวจจริงแล้ว; Overlayอยู่offline/postgameไม่ได้พิสูจน์in-gameHUDเต็ม. Original15WAV+manifesthashตรงต้นฉบับและยังใช้ann-packเดิม.

หลัง186.8swarmup เก็บ601samplesครบ600.0008s:599completeRAM310.37–407.54MB,2over400และ2unavailable; CPU601validmax10.289%,6over10. **ยังไม่ผ่านงบทั้งRAMและCPU**. Peak407.54MB=stable8processes366.58MB+`nvidia-smi`32.60MB+conhost8.36MB; tasklistไม่มีแล้ว. ไม่ยกเว้นprocessเหล่านี้หรือเปลี่ยนunit/threshold. Receipt`f07-related-native-receipt.json`แยกidleproofจากlive/FPS/acousticgates.

ถัดไปให้เปลี่ยนGPUfeederจากspawnNVIDIA-SMIเป็นpersistentreadonlyNVMLผ่านtrustedWindowsSystemDirectory DLL. รักษาJSON/units/GPU0/error/staleness/health+ACKเดิม, ไม่มีfallbackspawnCLIหรือfeatureflag. ไม่เพิ่มการเก็บหรือส่งข้อมูลผู้เล่น. NativeDLLfailure/unsupportedต้องunavailableไม่ใช่zero; init/sample/shutdown/export/ABI/lifetimeและno-childprocessต้องมีRED/GREEN+nativeprobeก่อนremeasure. งบ400MBและCPU10%เดิม รวมresidentDLLในfeederจริง. หากยังมีCPUovershootค่อยทดสอบhardcapheadroomภายใน10%โดยไม่แก้สัญญา; ยังไม่เปลี่ยนcapในขั้นแรก. งานตัดVRZOที่ผู้ใช้ขอเพิ่มทำก่อนเปิดbuild/benchmarkรอบถัดไป.

## NVML candidate measurement

CandidatePID30984 (`p1-nvml-ann-20261028-015549`) passed475Rust/7ignored,384frontend and24GPUfeeder tests plusClippy/TSC/ESLint/unsignedembeddeddebugbuild. BothtrustedrootsloadedandOverlayACKready. After275.2swarmup,31completeRAMsamples436.81–449.77MB allfailed400MB;31validCPUmax5.2084%,noneover10. Requested601samplesstoppedat31forRAMfailure;ten-minuteacceptanceincomplete. Job9/9stablewithnosampledtasklist/NVIDIA-SMI/conhost. NewresidentNVMLandallutilityprocessesremaincounted. No causal steady-RAM saving is claimed against the earlier different native run.

Keep the400MB contract and current readiness withdrawal. Next work requires per-PID native residency/lifecycle attribution under the same measurement method before another source change; removal of GPU child processes was insufficient. Full liveCV/audio/FPS/device matrix remains open. VRZO authoring is completed separately, added to this local debug candidate without activation, with original Nakhom active and all source hashes preserved.

## Controlled automatic-diagnostic removal

The latest instrumented candidate still failed at436.81–449.77MB. Before another product architecture change, compare a candidate removing only automatic `webview_memory::start_diagnostics` and its module registration. The numeric CDP sampler was added for investigation; it is not a companion feature or the external RAM acceptance method. Preserve its original source in ignored evidence. Retain supported WebView LOW settings, both windows, all native readiness/trust/visibility logic, templates/model, full process accounting, original Nakhom and VRZO.

CandidatePID11216 (`p1-no-cdp-ann-20261028-021939`) has rootSHA `0F9045A2E7EDC33740B0CF9B06C68A4272E3FCAE6E7129B12D8436BB4836C7DB`; frontend and feeder match the failing candidate. Measure at1s after120s warmup with the same external exact-Job sampler. Compare overlapping creation-age windows against the earlier275s-warmup run; note GC/device/state and transient child-role limits. Do not infer a causal byte saving or a passed ten-minute gate from the first31 samples.

A separate source trace found cosmetic `VoiceWave` decoding full audio bytes and starting a silent hardware AudioContext while Rust owns audible playback. A bounded native spectrum metadata alternative is design/test-draft only in ignored evidence. Do not bundle it into the automatic-diagnostic experiment or add the API unless further measured cost requires it. No product waveform behavior is changed by the current candidate.

## Full controlled result and next candidate

The no-CDP experiment completed601samples:600completeRAM268.64–431.98MB,oneover400andoneunavailable;CPU601validmax12.36565%,threeover10. Full result **FAIL**, despite the first31 being below400. Earlyphaseunknown; late183loggedGSI ticks prove actual `GAME_IN_PROGRESS` from02:28:39–02:31:41. Peak includes owned PowerShell58.39MB plus conhost8.55MB overstable365.04MB. Never exclude those processes. Safe metadata/source correlation did not establish the exact SAPI caller; fixed prewarm WAV mtimes precede those launches. One120s metadata-only child observer saw no new PowerShell. Evidence remains in `keep400-next-20261028/no-cdp-run/`.

Next compare a fully optimized native/dependency build using ephemeral Cargo package overrides `profile.release.package.g-maiden.debug-assertions=true` and `overflow-checks=true` for this local unsigned authoring candidate. App lib/bin compiler evidence preserves authoring gates and Cargo `tauri/custom-protocol`; dependency assertion behavior differs from dev. No production profile/auth policy is edited and no Store receipt is forged. First build compiled successfully (7m03s) but is not the final artifact: later zero-frame safety changes require a new build and verification. Default472tests/7ignored, rootClippy, feeder24/Clippy and frontend384/TSC/ESLint passed before that safety correction; the optimized full suite was deliberately superseded, not passed.

Read-only validation found four46-byte prewarm WAVs with zero data frames accepted by `len>0`, and the playback thread could acknowledge an empty decoder as success. Correct with positive/bounded prewarm data validation and a known-empty source guard before append/ACK, preserving unknown-duration MP3 behavior and all voice/priority/generation/deadline contracts. Preserve actual RED/GREEN evidence and rerun full final tests. This does not claim acoustic latency or that a live warning selected the empty fallback.

The measured12.36565% CPU peak motivates operating cap800(8%) under the unchanged **≤10% acceptance threshold**. Windows cap enforcement is not a per-sample acceptance receipt; retain margin, verify actual queried cap in the next native run, and keep CPU budget/error/pressure admission unchanged. The existing sampler's hardcoded1000 metadata must be replaced by an actual Job CPU-rate query before use with the new candidate. Native RAM includes every real child and shared resident page; full resource/FPS/acoustic/device acceptance remains separate.

## Latest native failures and bounded follow-up

The zero-frame and operating-cap fixes passed479 default/optimized Rust tests (7ignored),384 frontend tests,24 feeder tests, Clippy/TSC/ESLint and the unsigned optimized smoke build. Candidate SHA256 `B8343BD3B827E29103A59C734C623BB1D9B55D438B9185F192694DE48FE289EB` preserved app debug assertions/overflow checks and original Nakhom. This is historical verification before the following source changes.

Its AX-assisted desktop/UI601-sample run failed:600 complete RAM samples388,784,128–429,359,104bytes,517 over400M and one unavailable. CPU601 samples peaked6.380773%, none over10; actual queried Job operating cap800/flags5. The first RAM breach preceded the overlay preview by33.45s. Voice-settings enumeration added an owned PowerShell/conhost membership transition; it remained unavailable rather than silently omitted. Whole-pack overlay preview proves cover rendering only, not audible playback.

A screenshot-only comparison used the identical binary/assets without UIA trees/text, CDP or browser flags. It also failed:31 complete RAM samples379,420,672–405,282,816bytes, one over400M, no unavailable; CPU peaked3.777248%, no over10. The early-stop rule prevented the scheduled UI workload and full601-sample gate. Accessibility instrumentation therefore does not explain the whole failure. Receipts remain in `keep400-next-20261028/final-optimized-cap800-run/` and `final-screenshot-only-cap800-run/`.

Proceed with measured-source fixes while retaining all modules and full accounting:

- Cache at most64 formatted history labels by local civil timestamp/locale, preserving all fallback/DST/date semantics. Repeated12-row resource pulses now call the formatter12rather than120times in the regression. Full frontend390 tests/TSC/ESLint passed before the subsequent waveform changes. No native byte saving is claimed yet.
- Allocate the full-screen DXGI staging texture on its first actual full-frame copy, reuse it and invalidate after successful recreation. Normal ROI acquisition stays unchanged; legitimate calibration/full-frame fallback remains. Nominal1080p texture payload8,294,400bytes is not a measured Working Set saving. Pure tests passed; native display tests and final integration remain pending.
- Replace only installed classic SAPI voice metadata enumeration with a bounded native COM catalog. Do not create a voice engine/output device or change live/prewarm speech. Both installed voices matched the four old DTO fields;20 native probes exited cleanly after correcting COM-release order. The standalone native enumeration process peaked9.72MB versus77.00MB for its old PowerShell comparison; whole-app acceptance is still required.
- Replace the cosmetic waveform's full PCM IPC/browser decoder/silent output device with bounded native64-bin/50ms metadata, at most600frames/30s. Stream on one blocking worker, preserve exact resolver/root/Store-integrity checks, retain actual rodio playback and render unavailable metadata blank. Native audio-only per-event inventory previews must preserve selected-pack/default fallback without changing activation or emitting a banner. No CPU/RAM acceptance claim before full native verification and remeasurement.

All latest sources must be frozen/reviewed, default/optimized suites and smoke build rerun, then the fresh artifact opened and measured after warmup. Original Nakhom remains active; VRZO and the separately requested HoN Nakhom pack remain selectable. No budget, release channel, Store receipt or CV identity threshold changes.

## Final waveform candidate and one-variable rendering experiment

Candidate `p1-native-wave-ann-20261028-043304`, SHA256 `36D12B34B93B4AD3E58B8F9BDD5B1B5F6EFDDA462D1F33D80BE52A933346A650`, passed510 default and optimized Rust tests/7ignored,422 frontend tests/47files, Clippy/TSC/ESLint and the unsigned optimized no-bundle build. All five real-display DXGI tests passed with normal desktop updates on the same source after a first1pass/4no-frame failure on a quiet display; both results remain recorded. The original15 WAVs/13events, VRZO21WAV/15events, new HoN Nakhom12WAV/12events and nine separate Signal files match their sources; original `pack_mrijgajn` remains active.

The full601-sample desktop/UI run **failed RAM**:601 complete readings364,027,904–458,104,832bytes,426 over400M and no unavailable readings. CPU601valid readings peaked9.245385%, none over10; queried operating cap800/flags5 and exact eight-process membership remained stable. First31 samples364.03–366.60MB were below the gate, but do not establish acceptance. First breach occurred0.847s after opening Voice settings, before opening the Overlay editor. Browser/renderer/GPU residency grew; host and feeder were nearly stable. No PowerShell/conhost child or process exemption explains the excess. Native receipt and exact action timestamps are retained in `keep400-next-20261028/final-native-wave-cap800-run/` and `wave-native-ui-action-receipt.json`.

Native Play was clicked without a visible UI error, but physical audibility was not recorded. Explicit pack-preview clicks did not provide visible banner/waveform proof. The render-only preview in Control applies only while the Overlay category is open and clears on category exit/unmount; later inventory preview actions were not in active cosmetic preview mode. No fake GSI tick or game input was sent. Live CV/audio/FPS and the broader matrix remain open.

Bounded native font-mapping inspection found1.67MB named font residency in the renderer, including0.213MB Segoe UI Emoji. That does not support blaming large directly mapped fonts for the58.1MB excess. Anonymous/system/GPU font cache cost is still unknown; do not replace icons based on this result. Nested card blur was also ruled out by source: `.settings-group` has no filter. The opaque console background plus Cinematic backdrop filter is a separate rendering lead, not permission to remove the owner's visual-quality choice without visual evidence.

Following Astra architecture review, use **one intervention** for the next comparison: isolate the entire Voice-settings subtree behind a memoized render boundary receiving stable settings, voice-list and setting-change props. Stabilize the existing generic setter without changing its behavior. Preserve all current JSX, styles, labels, emoji, event handlers, settings context, native commands and active-pack state. Keep Control telemetry/status/tick subscriptions and all freshness/visibility/consent gates unchanged; do not add category-specific data suppression. Own async scan/count, expansion and playback state must still update.

Before implementation, retain the exact baseline source. RED/GREEN must demonstrate unchanged Voice render counts across both parent publications and Control resource pulses, while real settings changes, late voice-list resolution, Rescan and expanded clip updates still work. Run the full frontend/static suites and an embedded optimized smoke build; native Rust source remains the510-test/Clippy-verified baseline. Reopen and compare using the same full-WS sampler, window size, Cinematic setting and normal UI actions, including scrolling the event list. A failed diagnostic may stop early only with an explicit incomplete/failing receipt; acceptance still requires all601 readings. Separate initial category jump from later growth. If the peak remains over400M, keep the gate open and do not bundle CSS/font/blur changes into that same experiment.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Owner chose unchanged400MB; start measured native/frontend/lifecycle remediation. |
| 0.2.0 | 2026-10-28 | Isolate faulting native metadata requests and test unchanged-history formatter allocation before native comparison. |
| 0.3.0 | 2026-10-28 | Record failed formatter RAM comparison; proceed reviewed related-view experiment and measured tasklist transient removal. |
| 0.4.0 | 2026-10-28 | Record full ten-minute failure and NVSMI peak attribution; plan persistent readonly NVML while preserving all budgets. |
| 0.5.0 | 2026-10-28 | Record actual NVML candidate RAM failure; retain unchanged budget and require process residency attribution before next fix. |
| 0.6.0 | 2026-10-28 | Compare automatic CDP diagnostics removal as a single variable; keep waveform alternative deferred outside production. |
| 0.7.0 | 2026-10-28 | Retain full mixed/live failure; compare optimized authoring build, correct zero-frame fallback admission, and test CPU operating headroom without changing acceptance budgets. |
| 0.8.0 | 2026-10-28 | Retain both optimized native failures; implement bounded history-label, lazy DXGI, native catalog and waveform follow-up without claiming resource qualification. |
| 0.9.0 | 2026-10-28 | Record510/422 checks and full458MB failure; reject unsupported font attribution and isolate Voice rendering as the next single-variable experiment. |
| 0.10.0 | 2026-10-28 | Owner replaced the400MB target with800MB; retain old failures and completed render isolation without claiming memory acceptance. |
| 0.10.1 | 2026-10-28 | Record current900MB MVP decision; preserve historical400/800MB results without acceptance claims. |
