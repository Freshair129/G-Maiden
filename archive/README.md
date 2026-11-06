# archive/

Records moved out of active directories by #134 (phase 4). Nothing here is read by
the build, CI, `tools/doc-graph`, or the app. Kept for history only.

| Path | Was | Why archived |
| --- | --- | --- |
| `govibe-agents/` | `.govibe/.agents/{auditor,backend,context,cto,devops,frontend,pm,qa}` | No code, CI or document referenced these paths (checked 2026-11-06). `.govibe/.agents/agent-registry.yaml` and `doc_writer/` stay in place. |
| `brain-verification/gap01-02-webview-2026-09-13/` | `.brain/verification/gap01-02-webview-2026-09-13/` | No inbound references. |

To restore, `git mv` the directory back to its original path.
