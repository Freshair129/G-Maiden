# G-Maiden 0.13.6 candidate review

Candidate source `8efdd32e03a6ce26088c06db29394bddbe9ad4bf`, tag `v0.13.6`.
The [candidate workflow](https://github.com/Freshair129/G-Maiden/actions/runs/41554281189)
completed successfully. Build-evidence hashes and Tauri updater signatures were verified for
the NSIS and MSI artifacts. The Dev manifest was merged in
[#125](https://github.com/Freshair129/G-Maiden/pull/125).

The signed NSIS installer completed on the local Windows machine, the installed app started,
and its log reported loading the 128-class ONNX model. The app showed the local VRZO GANN
revision 6 selected. Its package maps 14 of 24 events; `kill` is unmapped and remains silent.

In installed-app previews, First Blood, Double Kill, Triple Kill, Ultra Kill, and Rampage
logged matched GANN media pairs and audio completion. The native player reported completion
for each. Submitted frames correlated with compositor records for all frames in four events.
First Blood was repeated once: each run had 435 of 436 frames matched, with different unmatched
frames. A missing compositor record is not proof the display dropped a frame, and neither run
establishes complete physical-display output. No independent loopback or microphone recording
was taken for this candidate, so audible synchronization remains unqualified. Earlier live-match
evidence belongs to a previous binary.

The first startup logged a transient `profile_busy`; a subsequent app session showed VRZO
equipped and completed the previews. Its cause and recurrence remain unknown. Older-version
auto-update testing was explicitly deferred by the owner because this is the first MVP release.
Other unmeasured runtime compatibility and resource targets remain unknown.

The owner delegated the MVP decision after the First Blood evidence limitation was explained.
The technical review accepts that limitation without claiming a complete frame or acoustic pass.
The open issue inventory was reviewed; none is classified or labeled S0/S1. This does not mean
all open issues or untested scenarios are resolved. GitHub's separate production-environment
review must still be performed; this record is not that environment approval.
