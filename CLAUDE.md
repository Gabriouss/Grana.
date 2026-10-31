@AGENTS.md

<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- After ANY change to the project, update context.md, the vault session note and the canvas round note immediately (not only at session end), so a usage limit that drops an agent loses nothing (author, 23/10/2026).
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
- Never redirect users or open new windows to any destination except the Cakto checkout; keep them on the page. Allowed exceptions on the landing (author, 22/10/2026): the header "Entrar" button, the footer links (Criar conta, Baixar o app, Entrar, Termos de Uso, Privacidade, Excluir dados) and the Instagram link in a new tab.
- After every project change, update the fichário, the Vault, and context.md in real time so work context isn't lost.
- Keep the overall video style consistent across the series, but vary some visual aspects in each video so they are not identical.
- For GranaPonto covers, match the video's visual style and brightness, and avoid phone mockups or cropped screenshots; build app blocks instead.
- Always keep the R$ currency symbol directly next to price numbers in GranaPonto UI and copy.
- Keep all essential content inside the 1080×1440 safe area; outside it, use only decorative elements that keep their meaning in other Facebook/Instagram ad formats.
- For reels, keep all on-screen content within a 1080x1440 safe area inside the 1080x1920 frame.
- Keep layout content within a 1080x1440 px margin inside the 1080x1920 px space.
- Keep all GranaPonto project information local on this PC; never create Claude artifacts or send project content to the Claude site.
- Remember that this project has two Codex accounts and one Claude account available.
- Keep Play Store release work from affecting current users; make changes incrementally and adapt as we go.
<!-- end claude-reflect -->
