# Web cleanup validation — 2026-10-02

Baseline: deployed main v0.4.0 (`9979c72`) plus Pages packaging (`20dd37c`).

## Changes

- Share one catalogue request and JSON parse between both showcase viewports and
  the model-source dialog; failed loads can be retried.
- Update phase descriptions, action lists and milestone states only when the
  timeline enters a different phase. Time, slider and 3D lighting still update
  continuously.
- Remove the unused vertical pointer animation, duplicate startup calls, unused
  renderer state and a redundant preview alias. Reuse 3D lighting colors and
  the editor's existing collision results.
- Package only the showcase's referenced images and five models. The separate
  model library remains in the repository; it is unused by the deployed editor
  and introduction.

## Measured results

- Phase-list DOM replacements during two seconds of playback within a phase:
  **118 → 0**.
- Catalogue requests on page load: **3 → 1**.
- Static output: **7,992,194 → 5,959,980 bytes** (about 25.4% smaller),
  **121 → 59 files**. This is deployment size, not a claim that every visitor
  previously downloaded all those files.
- Changed runtime source, including the new shared catalogue module:
  **153,005 → 152,744 bytes**. Regression tests and this report are additional.

## Verification

- 100 frontend test files / 1376 tests pass.
- 7 root test files / 57 tests pass, including shared-load and retry coverage.
- Frontend typecheck, production build (including lint), and diff check pass.
- Desktop screenshots at 1440×1000: hero and scene are pixel-identical.
- Mobile hero screenshot at 390×844: pixel-identical, no horizontal overflow.
- Browser checks pass for phase boundaries (including 48 hours), playback,
  synchronized zone/camera selection, reset, all five models, model/photo
  dialogs, five download links, and Markdown export.

The pre-change public-page trace observed LCP 1845 ms and CLS 0.00 on one
unthrottled run. No before/after Core Web Vitals improvement is claimed: the
repeatable comparison here measures redundant work and artifact size.
