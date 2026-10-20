@AGENTS.md

<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Always run the Orquestrador Supremo terminal on Opus 5.5 at medium effort; check and correct it at session start if it is on another model.
- Always run the Codex orchestrator on model Sol 6.1 with medium effort, never Luna.
- Do not let any post move to approval unless it has a caption ready to publish.
- Treat 9:16 images as possible Reels covers as well as Stories when classifying GranaPonto pieces.
- Keep realistic device proportions in mockups; a phone must never be drawn larger than a notebook.
- Write captions that differ from the creative's copy; captions should only contextualize what the creative says, never repeat it.
- In the GranaPonto admin panel, approving an item should automatically move it to the approved list, with no separate manual move step.
- Keep the mobile web layout identical to the native app: the Granabô mascot stays in the bottom bar on phone web, floating only on tablets and desktop.
- The carousel POST scheduling route (panel → RPC → executor v4 → Graph, carousel v9 on 19/10) is the proven reference: plan improvements are allowed, but they must keep that path working, backed by a regression test of it and a ready rollback to v4.
- Record Grana creative adjustment requests as do-not-do items in ajustes.md and remove them from the request list.
- Never include sample or placeholder data in post copy; captions must use only real, verified information.
- Whenever a deliverable is finished, add it to the approval panel (para-aprovacao) without being asked.
- Never break existing working behavior; every change must avoid regressions and keep current passing functionality green.
<!-- end claude-reflect -->
