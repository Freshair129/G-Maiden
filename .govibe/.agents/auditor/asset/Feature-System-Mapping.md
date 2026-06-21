# Feature System Mapping

Feature specs must live under the folder that matches their primary PRD system.

## Folder Map
| PRD System | Folder |
|---|---|
| `SYSTEM-01::Mission-Control-Experience-System` | `docs/features/mission-control/` |
| `SYSTEM-02::Project-Roadmap-Management-System` | `docs/features/project-roadmap/` |
| `SYSTEM-03::Docs-to-Code-System` | `docs/features/docs-to-code/` |
| `SYSTEM-04::Diagram-to-Doc-System` | `docs/features/diagram-to-doc/` |
| `SYSTEM-05::Agent-Team-Management-System` | `docs/features/agent-team/` |
| `SYSTEM-06::Integration-Bridge-System` | `docs/features/integration-bridge/` |
| `SYSTEM-07::Governance-Access-Control-System` | `docs/features/governance-access/` |
| `SYSTEM-08::Genesis-Knowledge-System` | `docs/features/genesis-knowledge-system/` |
| `SYSTEM-09::Traceability-Audit-Verification-System` | `docs/features/traceability-audit/` |
| `SYSTEM-10::Execution-Governance-System` | `docs/features/execution-governance/` |
| Platform runtime | `docs/features/platform-runtime/` |
| Quality and testing | `docs/features/quality-testing/` |

## Audit Checklist
- [ ] Feature file is in the correct system folder.
- [ ] Feature file declares or implies a primary PRD system.
- [ ] Cross-system impact is documented when the feature spans multiple systems.
- [ ] Missing high-priority feature specs are tracked in `docs/features/README.md`.
- [ ] Moved files preserve readable history through `git mv`.

## Coverage Note
Use `docs/features/README.md` as the current coverage index. Treat older SYSTEM-08 folder aliases as legacy naming when encountered in archived docs or references.
