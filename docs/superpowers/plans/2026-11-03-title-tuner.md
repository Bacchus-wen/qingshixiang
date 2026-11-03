# Title and tuner loading screen implementation plan

> **Withdrawn 2026-11-03:** The user requested the original title and loading screen. This plan is historical only; its UI code has been removed. The robot/lamp repairs remain.

> Execute locally in the existing checkout so the user's previous, uncommitted game repairs remain in place. The user approved the design in chat and requested implementation. Do not invoke Claude, Lumina, paid generation, or deployment.

**Goal:** Replace the small black title page with custom vector lettering and an old-radio tuning scale that follows initial loading and becomes the start entrance.

**Architecture:** A lightweight boot module mounts the title before importing the game. Film keeps owning title visibility and the existing story UI; a separate title-screen component owns the new display. A monotonic progress model combines actual resource completions with engine initialization and warm-up callbacks, reserving 100% for successful initialization.

**Tech stack:** Existing Vite/native ES modules, SVG paths, CSS transitions, Node tests, Playwright's bundled Chromium. No new dependencies or generated assets.

## Constraints

- English remains the default, with the existing Chinese language switch.
- Draw the visible title with original SVG paths; retain semantic text for accessibility.
- Keep title interaction disabled until initialization succeeds; support click, Enter and Space, touch, retry, and reduced motion.
- Preserve the game story, audio, and the previous robot/lamp repairs.
- Do not manufacture timed progress or delay a cached load to play an animation.

## Tasks

- [x] Add `src/ui/loading-progress.js` and tests for early resource feedback, non-decreasing progress, invalid input, and the rule that only `complete()` reaches 100%.
- [x] Add custom Latin/Chinese path lettering, a title-screen component, and scoped CSS. Integrate with `Film`, including ready/error/hidden states and semantic controls.
- [x] Add a lightweight `src/boot.js`, share title copy without importing Three.js, and connect temporary loading-manager callbacks plus engine progress in `src/main.js`. Restore callbacks after initialization.
- [x] Extend the existing screenshot tool to capture title states. Verify desktop and mobile layouts, both languages, progress movement, failure/retry, keyboard/button entry, the actual game opening, the build, and existing LOD regression tests. Record results and release file claims.

## Verification

- `node --test src/ui/loading-progress.test.mjs src/systems/shop/lod.test.mjs`: 7/7 pass.
- `node tools/title-check.mjs`: actual WebGPU initialization reports advancing completion samples through 100%; no font downloads, no runtime errors; click unlocks audio and starts arrival; Enter and Space also work. Touch entry, 320×568 / 390×844 / 844×390 bounds, Chinese switch, reduced motion, and failed-bundle retry pass.
- `tools/shot.mjs --title …`: inspected English desktop, Chinese desktop, phone portrait, phone landscape, loading and ready screenshots. Title fixtures intentionally hold the game import to inspect UI states; the functional test above exercises real asset progress separately.
- Actual opening probe: title → arrive → wait; robot stays at L1, no console errors.
- `npm run build`: passes. No dependency additions, external assets, generation, commit, or push.

## Period atmosphere refinement (user feedback, same day)

- [x] Reuse the existing shop-front screenshot unchanged, with CSS shading for title contrast. Record its source in CREDITS.md.
- [x] Replace the clean geometric Latin paths with original slab-serif sign lettering and a small 青石巷 seal. Preserve the Chinese SVG title and the existing game name.
- [x] Build an aged radio plate with a progress-driven needle and decorative knob, a physical start key, enamel service sign, repair ticket, and three faint dust motes. Keep decoration away from interaction and hide it on compact viewports.
- [x] Verify the actual loading/entry/retry/audio flow, mobile and landscape bounds, reduced motion, and both languages. The seven existing unit tests and production build pass.
- [x] Inspect desktop, mobile, landscape and Chinese production UI fixtures. Wait for image decoding and finite transitions before capturing title screenshots. Confirm the final 100% needle alignment.
- [x] Run Impeccable detect once on the changed UI files. Reviewed its two border warnings: the needle's CSS triangle and the key's physical lower edge are intentional, not rounded card accents.

The background is a 1.3 MB local copy of existing artwork; no new generated imagery, font downloads, dependencies or paid API calls are involved.
