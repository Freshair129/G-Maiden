---
title: "G-Maiden — Related WebViews Memory Spike"
doc_id: "SPIKE-RELATED-WEBVIEWS-20261028"
status: draft
version: "0.2.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["PLAN-KEEP400-NATIVE-20261027", "mvp-decisions"]
---

# การทดลอง renderer ร่วมกันบน Windows

Owner อนุมัติให้ลด RAM ต่อโดยคง400,000,000bytes. Formatter reuse ผ่านtests/reviewแล้ว แต่native startup/ช่วงหลังwarmupยังมีค่าเกิน400MB; ไม่ได้พิสูจน์ว่าผ่าน. แผนนี้เป็นcontingencyทดลองsupported popup/openerเพื่อดูว่าสองUIที่ทำงานครบสามารถลดต้นทุนrendererซ้ำได้หรือไม่. SharingและRAM savingยังเป็นสมมติฐาน ไม่มีadoption/releaseจากเอกสารนี้.

## Contract

ControlและOverlayยังแสดงฟีเจอร์ครบตามsettings, labeled native IPC/capabilitiesเดิม, originalann-packเดิม, GSI/CV/Signal/voicepureRustเดิม. ทุกPIDรวมfullWorkingSetและcumulativeCPUเหมือนเดิม. ไม่ใช้browserflags/forceGC/trim/suspend/ซ่อนUIหรือยกเว้นPID. ไม่แก้auth/provider/cloudconsent/Storepolicy. ไม่ควบคุมเกม.

## Bounded implementation experiment

1. Purebootstrapstate+URLtestsต้องREDก่อน: exactlyoneexpectedpackagedrequest, noexternalhost/credentials/port/path/query/fragment, duplicate/late/failedrequestsdenied, pendingvisibilityretained, startupdeadlinecannotbeoverriddenbylatecallback.
2. Configสองหน้าต่างเป็น`create:false`templates. สร้างControlจากconfigในsetupพร้อม`on_new_window`handlerก่อนbuild. ไม่เปลี่ยนApp.tsxlabelrouting. หลังControlfinishedloadingที่canonicalpackagedURLจึงสั่งconstant`window.open`หนึ่งครั้ง; ห้ามใช้URLจากuntrustedinput.
3. HandlerอนุญาตเฉพาะcurrentControlorigin+targetที่ตรงcanonicalURLและstateRequested. CloneOverlayconfig,label`overlay`, initial`about:blank`, applyopener`window_features`; return`NewWindowResponse::Create`. ไม่navigateหรืออ่านDOMก่อนSetNewWindow. Anyfailure=explicitfailed ไม่fallbackสร้างindependentviewเงียบๆ.
4. หลังchildโหลดสำเร็จค่อยตั้งmonitorgeometry/cursorpass-through/always-on-top/LOWmemoryและoverlay-ready/settingshandshake. เก็บvisibilityintentจากnativecommand/shortcutระหว่างยังไม่ready แล้วใช้latestintentเมื่อready. Startupdeadline15sสำหรับspike; latecallbacksไม่revivefailedstate.
5. Staticandnativeverification: bothpackagedassets/CSP, label-specificIPC, hydratedsettings/layout/fullscreenrestore, tray+closebehavior, generationfences, originalWAVparity. `about:blank`หรือmissingUIไม่ใช่memorysuccess.
6. Provesharingด้วยstableper-environmentprocessmetadata+successfulIPC/readinessจากทั้งสองviews; processcountอย่างเดียวไม่พอ. ห้ามคืนframe/extendedprocessqueryที่ทำให้runtimeล้มในรอบก่อน. หากmetadataพิสูจน์ไม่ได้ให้ผลเป็นunknown.
7. Comparefullnativeaggregateafter>=120swarmupกับbaselineและoriginalformattercandidate. RAMfailต้องเก็บreceiptและทำขั้นถัดไป; RAMpassช่วงสั้นไม่ใช่fullidle/live-CV/Voice/FPS/acousticacceptance. ล้ม/unsupported/CPUเกิน/IPCเสีย=spikefail, คืนเฉพาะpatchของspikeโดยรักษางานอื่น.

## Pre-code review requirements

AstraตรวจinstalledAPIsแล้วเห็นว่าเป็นboundedexperimentที่ทำได้ โดยมีเงื่อนไขบังคับดังนี้:

- จำกัดongoingmain-framenavigationของทั้งสองviewsที่packagedURLเดิม และdenychild/nested/duplicatepopups; destinationURLไม่ใช่หลักฐานinitiatingframeidentity. OAuth/topupยังใช้existingnative`open_url`เพื่อexternalbrowser.
- Native readinessต้องรับ`overlay_bootstrap_ready`จากnativewindowlabel`overlay`ที่finalURLถูกต้อง หลังhydratedSettingsและlistenersครบ; pagefinish/Createอย่างเดียวไม่พอเพราะWryไม่ได้ส่งต่อSetNewWindowHRESULT. Idempotentreadyของviewเดิมอนุญาต แต่timeoutเป็นterminalและlatehandshakeแก้ไม่ได้.
- ทุกsetup-timewindowassumptionต้องย้ายให้ถูก: explicitControlcreationก่อนclose-to-trayhandler; Overlaygeometry/pass-through/LOWหลังcreation; command/shortcutintentคงไว้ก่อนready. ห้ามถือmutexระหว่างสร้างnativewindowหรือCOMcallback.
- Functionalproofและsharingproofแยกกัน. หากsafeprocessmetadataยืนยันไม่ได้ให้sharingunknown แม้RAMลด. Recoveryยังเป็นcleanrestartเท่านั้นจนกว่าจะมีหลักฐานเพิ่มเติม.

## Trust and recovery review

Opener linkageเพิ่มsame-originDOMreachabilityระหว่างControl/Overlay. ทั้งสองเป็นtrustedpackagedappและมีorigin/localStorage/nativecapabilityaccessอยู่แล้ว แต่ต้องตรวจว่าไม่ได้มีexternalnavigationหรือuntrustedcontentที่ได้ใช้linkage. ExactbootstrapURLallowlistต้องไม่ขยายexternalpopup/บัญชีloginbehaviorโดยไม่ตรวจสอบ. ไม่เพิ่มcloudcontextหรือcredentialexposure.

Sharingcouplesrendererhang/crashของทั้งสองUI. RustGSI/capture/Signal/audioไม่ย้ายเข้าrenderer. Spikeใช้cleanapprestartเพื่อrecoveryเท่านั้น ไม่ทำrecreationloop/profilemigration/delete. ก่อนadoptionต้องพิสูจน์restartsettings/current-sessionhydrationและเสนอผลfaultrecoveryอย่างชัดเจน; ไม่อ้างresilienceจากunit tests.

## Restore the existing development workflow before adoption

ทดลองpackagedWindowsstartupแล้ว: bothloaded/overlayready, samebrowser17676และoneRenderer22256ในexactJob8/8. แต่hardcodedpackagedrootของspikeทำให้normal`tauri dev`ใช้ไม่ได้ จึงต้องแก้regressionนี้ก่อนadoption. ใช้framework`tauri::is_dev()`ที่ตรวจcustom-protocolfeature ไม่ใช้debug_assertionsและไม่เพิ่มuserfeatureflag.

เลือกimmutableallowedrootหนึ่งค่าต่อprocess: packagedใช้`http://tauri.localhost/`เท่านั้นแม้debugassertionsเปิด; frameworkdevใช้configuredcanonical`http://localhost:5173/`เท่านั้นตามVitestrictPort. Missing/changed/external/credentials/path/query/fragmentต้องfail ไม่allowสองrootพร้อมกัน. โหลดControlด้วยWebviewUrl::App(index.html)ให้ตรงresolverจริง; popupargumentใช้JSONescapingของselectedroot. Navigation/admission/PageLoad/nativeACKทั้งหมดเทียบrootเดียวนี้, visibilitydispatcher/deadline/frame-srcnoneเดิม. Configเป็นtrustedbuildinputแต่TAURI_CONFIGmergeต้องไม่อนุญาตarbitraryremoteIPCcontent.

ก่อนcodeต้องRED/GREENdevrequest→create→load→ACK, cross-modedenials, packagedselectionindependentofdebugassertions, bad/missingdevURL, และexistingdeadline/visibilityraceทั้งหมด. InstalledTauri2.12is_dev public;get_app_urlprivateจึงไม่เรียกprivateAPI. Nativepackagedstartupและnormaldev/HMRproofต้องแยกclaim; modefixไม่ใช่RAMacceptance.

## References

- [Microsoft NewWindow requirements](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2newwindowrequestedeventargs): fresh unnavigatedtarget,sameenvironment/profile.
- [WebView2 process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model): sharingenvironmentไม่ได้guaranteerenderersharing.
- Installedsource: Tauri2.12.0/tauri-runtime-wry2.12.0/Wry0.57.0; runtimehandles`about:blank`anddeferredSetNewWindow. ImplementationmustverifytheseexactAPIs, notassumeasupportedpromiseofsharing.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Document bounded related-WebView experiment and trust/recovery gates before code. |
| 0.2.0 | 2026-10-28 | Restore normal framework development root with strict per-mode admission before adoption. |
