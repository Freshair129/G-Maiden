---
title: "G-Maiden — Seven P1 Remediation Plan"
doc_id: "PLAN-P1-REMEDIATION-20261027"
status: accepted
version: "0.2.0"
updated: "2026-10-27"
owner: "G-Maiden"
approved_by: "Owner explicit implementation instruction in this chat"
related_docs: ["AUDIT-FEATURE-LOGIC-20261027", "mvp-decisions", "CR-036-missing-alert-evidence"]
---

# Seven P1 remediation

ผู้ใช้อนุมัติให้แก้เจ็ดP1 จากaudit แล้วทดสอบและเปิดlocalbuildใหม่ โดยคงann-packน้าค่อมเดิม. Scopeคือ F01/F03/F04/F05/F06/F07/F25; P2อื่นไม่รวมโดยปริยาย ยกเว้นdependencyจำเป็นที่อธิบายไว้.

## Workspace and evidence

ทำงานใน D:/gm-overlay-editor-fullscreen บนfix/missing-alert-evidence ฐาน4f19eb83 พร้อมapproveduncommittedCV changes. ไม่แก้ checkoutหลักD:/G-Maidenที่มี161dirty pathsหรือG-Suite. Before-sourcehashes/logs/ledgerอยู่ D:/G-Maiden/src-tauri/target/p1-remediation-20261027. ทุกการแก้ต้องมี failing regression ก่อน implementation; runsมีtimeoutและเก็บRED/GREENผลจริง. No release/tag/version bump or production activation.

## Interfaces and ownership

| Producer | Consumer | Ruling |
| --- | --- | --- |
| F01selectedport + /health | Setup cfg/port file/Studio + GPUfeeder | ใช้3000–3010และservice/porthealthcontractเดิมจากcheckoutหลักเฉพาะส่วนที่เกี่ยวข้อง; parentowns gsi.rs/setup.rs/gpu-feeder + updaterlib.rs |
| F03confirmedpresence | missing-state/frontendherocards | capture/Sentryproducer(C)ส่งvisible_heroesจากconfirmedcurrentobservations; frontend(A)ใช้identityแยกpresence+ready/freshness, unknownเมื่อไม่ยืนยัน |
| F04unknownthreat | BuybackAdvice/Overlay rendering | Aowns revive.rs/respawnifneeded + frontendtypes/rendering; ไม่มีsafe/should-not-buybackจากunknown |
| F06consentepoch | Adviceprovider dispatch/cache/publication | Bowns runtime.rs/master.rs; atomicrequestcontext+dispatchadmission, cancellation/stale-responseguard; no realprovidertraffic |
| F07providerresource membership | Ollama advice + governor/capture | Cowns governor.rs/slm.rs/newresourcehelpers; ห้ามแก้Bไฟล์ตรงๆ ส่งinterfaceที่ต้องใช้กลับparent; no unrelatedprocesskill/reparent |
| F25captureadmission | F03presence + F07resourcepressure | Cowns capture.rs/dxgi.rs/sentry.rs ifneeded; remove125/250/500mscriticalpolling, frame-drivenboundedwait, suspendreadinessifcannotmeetdeadline |

## Tasks and regression requirements

1. **F01 port/health compatibility (parent)**: REDbusy3000fallsback3001, allbusyboundedfailure, healthservice/portmatching, setupcfg+portfilefollowselectedport, selectedinstallpreserved, feederfollowsactualport. GREENadaptselectedcodefromprimary without replacingcurrentsessionvalidation. Test localephemerallisteners only; no touchingothercontainers.
2. **F03 truthful hero presence (A)**: REDknownroster+noobservationscannotbevisible; unready/expiredsnapshotclearpresencewithoutlosingIDs; confirmedfreshpositivevisible; missingpositive; wrongsessionignored. GREENconsumeconfirmedpresenceandreadiness, never infervisiblefrommissingabsence.
3. **F04 unknown buyback threat (A)**: REDfromGSI-onlytickcannotclaimsafe/nobuyback; unavailableally/threatmustbeunknown; knownthreatpositiveverdictretained. GREENtypedunknownevidenceandneutralUI/prompt; noLLMcalls/testswithprovider.
4. **F05 safe update installation (parent)**: REDstandbydownloadthenmatchstartcannotinstall; live/unknownstatecannotadmit; allowclosedDota/idlepositive; reentrancyguard. GREENsplitdownload/installandRustrecheckimmediatelybeforecommit. UItruthfuldefer/error, no actualupdateinstall.
5. **F06 consent revocation race (B)**: REDbarrierinterleavingsbeforegenerationcapture/beforedispatch/afterprovider; optoutpreventsunsentcloudclosureandstaleresponse/cache. GREENsynchronizedconfigsnapshot/dispatchtoken withboundedlocks, no networkincriticalSignalpath. Preserveexplicitconsent/own-statallowlist. Model/backendtokenrelatedinvalidationonlyifnecessaryforsamecontextcontract.
6. **F07 aggregate resource accounting (C)**: REDhost+children/externalmodelaggregate, missingPID/deniedquerynotgreen, PIDreuse/duplicates/decimals400000000B, monotonicCPUdelta normalizedcores. GREENenumerateownedprocessgroup+providerprocessesused, honestunknown/overbudget, noexternalprocesskillorhiddenbudgetexemption. Nativeprovidersamplingonlyreadonly; unitfixturesandWindowsprobe.
7. **F25 frame-driven critical evaluation (C)**: REDlivecriticalcadencecannotwait500ms, acquisitionwaitincludedindeadline, overloadmustwithdrawreadinessratherthanlatealarm; fakeclock/frame-sourceeventtests. GREENboundedDXGIwait/newframes/unchangedframes, cancellation/freshnesswatchdogseparate, stalecapturescannotemitvoice. ActualT0–T3audible/CPU/RAM/FPSacceptanceremainseparateevidenceuntilmeasured.

## Rulings

- R1: ReuseexistingisolatedworktreeandpreservepriorCV/othercheckoutdirtychanges; fullsourcefingerprintsrecorded. Costifwrong: integrationrework, neveroverwriteunrelatedwork.
- R2: ExternalOllamaisasharedservice; accountconservativelyandreportunavailable/admissiondeniedwhenrequiredmembership/readingscannotbeproved. Do notkill/unloadunrelatedmodelsormisrepresentJobhardcapascoveringunmanagedPIDs. Cost: adviceavailabilitymayreduce; fullresourceacceptancestillneedsactualmatrix.
- R3: Resourcepressureisnotpermissiontosleepcriticalpath500msandclaimready. Whencriticalevidence/deadlineisnotvalid,suspendandresetbaselinewithreason. Cost: reducedcoverageunderoverloadratherthanfalse/latewarning.
- R4: Preserveoriginal15WAV/13eventann-packbyhashinthenewisolateddebugtestcandidate. NoAIANNfallbackfiles, noforgedStoreinstallreceipt; otherMaiden/Signalchannelspreservecontract.
- R5: Userapprovedcodefixes/testbuild, notsignedrelease. Unit/synthetic/native-startupsourcesmustnotbeclaimedasfullacoustic10-sessionNFRacceptance.

## Review rulings added during implementation

- **R6 — updater commit boundary:** Tauri updater 2.10.1 extracts the installer after `install()` starts and has no fallible pre-exit hook. Vendor the exact pinned source with a narrow `install_guarded` method; recheck idle after extraction, before cleanup and installer launch. Keep upstream download/minisign verification. Remove raw updater JavaScript capability so the app uses its guarded native command. Upstream source hashes and licenses are in `src-tauri/vendor/tauri-plugin-updater/GMAIDEN-PATCH.md`.
- **R7 — delayed advice delivery:** Serialize the configuration generation with advice; reject delayed IPC/events and clear displays on native configuration changes. Guard actual speech spawn/queue with the generation. Keep cancellation, file preparation and Piper waits outside the configuration lock. Static voice previews acquire a current generation and still use native admission.
- **R8 — selected installation authority:** Reconcile the persisted frontend selection through `set_gsi_dota_selection` on control-window startup and await native persistence before changing it. Defer automatic config repair until that reconciliation; clearing the selection explicitly restores Steam auto-detection. Invalid saved selections cannot silently redirect repair to another install.
- **R9 — short-lived children and critical audio:** Use cumulative Job CPU counters so children that exit between samples remain counted. Critical audio dispatch uses prepared clips only, with native sink admission before T0+250ms; unprepared audio withdraws warning readiness. Actual audible onset remains a separate measurement.

## Native startup follow-up

- **R10 — debug console membership:** The first candidate's exact Job-handle probe found 10 Job PIDs versus 11 descendants; the root debug console was created before Job initialization. Use the Windows GUI subsystem for both app and headless feeder so no unmanaged startup console exists. Do not exempt that process from accounting. Native readings also found aggregate Working Set around 686 MB, so resolving membership is not RAM acceptance.
- **R11 — bounded memory experiment and GSI diagnostics:** Apply WebView2's supported low-memory target to the two embedded webviews, preserving the 400,000,000-byte aggregate Working Set definition and all PIDs. Measure again; retain over-budget/readiness withdrawal when still over. Log only throttled static GSI schema-rejection reasons locally, never raw payloads, to explain an offline stream during native UAT. These are necessary follow-ups to the F01/F07 runtime checks, not permission to change the resource contract or restart Dota.

## Verification and review

TaskownersrecordRED/GREENandself-review; do notrunconcurrentCargo/PNPMinstallsorfullsuites. ParentserializesfullRusttest/Clippy, frontendESLint/tsc/Vitest, provenance/docgraph, Tauriunsignedno-bundlesmoke. Allsourcechangesreceiveafreshwhole-taskreview(Astra)afterintegration; fixconfirmedcritical/importantfindingswithregressions. Startnewlocalcandidateonlyafterchecks; validatePID/path/hash, selectedhealthport, originalclipparity, CVcacheandhonestUIstate. NoGSI-fakeeventsorrealcloud/Store/updateactivation.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Owner-approved bounded implementation of seven P1 findings with TDD and original-announcer preservation. |
| 0.2.0 | 2026-10-27 | Record review corrections for updater commit, delayed advice, selected installation, short-lived child CPU and prepared critical audio. |
