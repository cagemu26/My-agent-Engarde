# Changelog

## v1.1.3 - 2026-04-02

### Overview
- Fixed blocking behavior in pose overlay generation by switching overlay endpoints to non-blocking background job enqueue flow.
- Improved video compatibility by adding `ffmpeg` runtime support and overlay transcoding fallback handling.
- Updated history page skeleton replay error display to surface backend status messages directly.

## v1.1.0 - 2026-04-01

### Overview
- Updated backend data models and service typing for more consistent UUID and schema handling across report, chat, feedback, invitation, training, and pose job domains.
- Improved LLM and RAG service integration paths and dependencies, including provider wiring and runtime packaging alignment.
- Refined pose analysis runtime behavior and production container setup to improve deployment consistency.
- Updated production deployment assets and templates, including Docker and nginx-related deployment scripts under `deploy/`.
- Updated frontend Analyze experience and brand assets, including dark-mode logo visibility and session/history interaction polish.
