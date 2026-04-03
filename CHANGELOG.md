# Changelog

## v1.1.5 - 2026-04-03

### Overview
- Fixed history and analyze report flows so pending analysis jobs can resume after navigation, and patched report JSON serialization errors that previously caused detail-page `500` responses.
- Hardened static CDN integration with validated `assetPrefix` handling, safer deployment guidance, CORS-friendly static headers, and supporting nginx/CDN verification docs.
- Polished session UI across Analyze and History so all three session types consistently render with their intended colored badges and framed styling.

## v1.1.4 - 2026-04-02

### Overview
- Added video-analysis completion notices that can be appended back into the related chat session after report jobs finish.
- Replaced native browser confirm and auth-expired alerts with the shared in-app dialog flow, and refreshed auth page branding with the unified logo component.
- Added CDN-oriented media delivery and static asset configuration across backend, frontend build, Docker, and nginx deployment settings.

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
