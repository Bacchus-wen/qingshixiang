# Loading tuner: material and composition revision

> **Withdrawn 2026-11-03:** The user requested the original title and loading screen. This plan is historical only; its UI code has been removed. The robot/lamp repairs remain.

The user accepts the tuning scale, rejects the surrounding title/background/decorations, and asks for convincing texture using techniques such as Three.js. Keep actual loading behavior and existing game repairs intact. This is a local, reversible implementation; no asset-generation service, deployment, commit or cross-AI call.

- [x] Add an optional, asynchronously imported Three.js instrument behind the semantic HTML scale: authored beveled casing, aged metal trim, recessed dial paper, glass reflections, and a ribbed bakelite knob. Use installed Three.js and procedural geometry/material shaders, without new bitmap assets or downloads.
- [x] Keep the first HTML/CSS frame functional before the optional renderer. A failed enhancement or lost graphics context must leave a usable progress bar and start/retry controls.
- [x] Tie knob motion to the same actual progress as the scale. Stop work while hidden and honor reduced motion; release GPU resources after leaving the title. Cap rendering resolution and avoid a continuous ready-state animation loop.
- [x] Use the user's answer for the surrounding layout. Until answered, work only on the loader; after a reasonable response window, default to removing the rejected background and decorative props and making the instrument the center of a restrained page. Retain name and accessible title until a separate naming decision.
- [x] Verify loading, ready, error/retry, entry/audio, 3D failure, context loss, disposal/reopening, reduced motion, both languages and compact layouts. Check renderer diagnostics and inspect desktop/mobile screenshots. Run build and existing regression tests.

Material roles: faded ivory dial #c6bb94; warm oxidized brass #8d7950; painted dark green #2a342a; deep bakelite #232720; red enamel needle #934c36. Actual 3D geometry carries the casing and knob; HTML retains readable labels and accessible controls. A directional key and local procedural environment give metal/glass something to reflect. No new scene/background illustration is part of this revision.

Verification: 7/7 unit tests, full `node tools/title-check.mjs`, build, and a separate actual production preview check pass. Instrument: 21 draw calls, 6,304 triangles, 15 geometries, 2 textures, DPR <= 1.5. Idle rendering is stopped after the progress transition; the test explicitly waits for that transition before sampling. Production entry unlocks audio, releases the optional context and requests no removed background image. Inspected desktop/mobile/Chinese/landscape and unmodified UI detail screenshots. Impeccable's one border warning belongs to the needle triangle. No generation calls, dependencies, commit, push or deployment.
