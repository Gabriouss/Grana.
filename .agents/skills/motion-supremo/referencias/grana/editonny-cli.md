---
name: editonny
description: Edit local videos through conversation: remove unnecessary pauses, audible breaths, mistakes, false starts, and repetitions; add captions, framing, audio, and visual scenes. Use for Reels, ads, sales videos, lessons, combining takes, adapting a visual reference, or refining an existing edit. Preserve originals and meaning, respect the requested scope, and verify a representative sample before completing the render.
---

# editonny

One portable entry point for local video editing and visual storytelling. Use the tools in this package to execute the request. Use clear English by default and respect an explicit request for another conversation language. Preserve the language and words of the user's recording unless translation was requested.

## Resolve the package

`<EDITONNY>` is the physical directory containing this file, resolving any symlink. `<ENGINE>` is `<EDITONNY>/engine`; `<VISUALS>` is `<EDITONNY>/visuals`. The root CLI is `<EDITONNY>/scripts/editonny.py`. Do not assume another skill or global engine is installed.

Use absolute media paths when a command changes directories. Prefer structured subprocess arguments; never interpolate speech or filenames into shell commands. Your current agent directs the edit using its native session; the package does not require an LLM API key.

```text
python3 <EDITONNY>/scripts/editonny.py doctor
python3 <EDITONNY>/scripts/editonny.py catalog "three steps"
python3 <EDITONNY>/scripts/editonny.py media status
python3 <EDITONNY>/scripts/editonny.py helper transcribe /path/video.mp4 --edit-dir /path/edit
python3 <EDITONNY>/scripts/editonny.py new /path/project --edit /path/edit --style paper
python3 <EDITONNY>/scripts/editonny.py scene --project /path/project --use three-steps --start 5 --end 9
```

If requirements are missing, read [setup](references/setup.md). Loading instructions does not prove the engine is installed or can render. Install the single package rather than creating separate processing or scene installations.

## Standard editing cleanup

Remove unnecessary pauses, audible breaths, mistakes, false starts, and redundant repetitions. Preserve complete words, natural pacing, intentional pauses, and the meaning of the speech. Measure cuts against the actual recording and review transitions so speech is not clipped. For targeted revisions, apply cleanup only within the requested editing scope; preserve unrelated content and approved timing.

This is the default for every full edit even when the user did not enumerate cleanup tasks. Explicit instructions to preserve a breath, pause, take, or approved interval override the default. Do not apply one silence threshold blindly or infer mistakes from a written script without listening to the recording.

## Start or resume

1. Find the footage and intended outcome in the request. Ask only for information that prevents work; when autonomy is authorized, choose reasonable defaults and record them.
2. Preserve original files. Use an `edit/` folder for transcripts and cut outputs, with the composition project alongside it. Read `edit/project.md` if resuming.
3. A full edit starts with [the engine workflow](engine/WORKFLOW.md). A visual change to an approved cut can start with [the visual library](visuals/README.md). A question about examples is not permission to render.
4. Match the aspect ratio and pacing to the destination: 9:16, 16:9, 4:5, or 1:1. Do not force the same pace on a lesson and a short ad.

## Edit and compose

Read the engine workflow and only the references needed for the current step. Local tools provide transcription, take comparison, waveform cutting, captions, face tracking, reframing, multiple cameras, noise reduction, music, preview, and review.

- Time every cut and visual entrance against measured speech, not estimates from a script.
- Verify names, numbers, negations, and corrections before building scenes. A sample template is not evidence of a result, price, testimonial, or offer.
- Prepare a representative **8–15 second** sample containing speech, captions, and a visual change. Review it yourself when autonomous execution was authorized; wait when the user requested sample approval.
- Keep faces and important content unobstructed. Captions need contrast, readable size, safe placement, and enough reading time.
- Keep previous exports and record the format, duration, decisions, and output paths.

## Use visual scenes

Search with `catalog` and choose scenes by `whenToUse`, category, and duration instead of loading the entire catalog into context. Prefer visuals that clarify a list, relationship, value, step, or demonstration.

- Use local code animation when it serves the request. Realistic bundled videos are already in `<VISUALS>`; `media status` verifies their integrity. Use `media import FOLDER` only to recover missing files from a complete valid bundle or backup.
- Apply a scene through `scene --project ... --use ...`. Customize the project copy, never the package template.
- Application materializes only the clips a scene references and preserves existing project videos. When changing an object source, copy the corresponding original into the project too. Keep personal media in the edit or an external personal library.
- Replace illustrative names, brands, ratings, prices, offers, and numbers with supplied facts. Omit unsupported elements instead of inventing them.
- Adjust camera, captions, and sounds after scene placement. Inspect beginning, middle, and end in motion, including backward seeking when applicable.
- Optional SVG/3D and external media workflows are described in [integrations](references/integrations.md). They are not mandatory dependencies. Media transmission and costs need authorization matching the request.

## Export and verify

Use `build.py hf lint`, `build.py hf check`, and render through the project's pinned HyperFrames version. Run only one render per project at a time. Use `engine/helpers/quality_gate.py` and interpret findings in context: expressive pauses, intentional darkness, and audio without narration are not automatically defects.

Inspect the exported MP4 for playback, voice and music, duration, captions, framing, text, cut edges, and synchronization. A still frame checks layout but cannot prove motion or timing. Record exceptions and unavailable checks honestly. Finish with the video and project paths, a concise change report, checks performed, and remaining limitations.

First-party code is MIT licensed. Bundled third-party code, fonts, models, and media keep their own terms and notices.

## Author and contact

Created and maintained by **Matheus Gomes**. [Instagram: @matheusgomes](https://instagram.com/matheusgomes) · [Email: eu@matheusgom.es](mailto:eu@matheusgom.es) · [GitHub](https://github.com/soumatheusgomes/editonny).
