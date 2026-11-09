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
- Follow the project's design system for all UI changes; create new visual elements only when the design system lacks them.
- Count future-dated salary toward the free-to-spend balance only after its entry date.
- Install the APK via Harbor only after production and APK builds are green; before that, report the APK as checked and waiting for the device.
- Do not merge main into the test branch; it becomes the next Play Store release and must not affect the current production app.
- Never merge the test branch into main; keep main as the user-facing branch and never let test-only changes reach it.
- As the supreme orchestrator, always analyze each task first and identify the most suitable model and effort level to execute it.
- Remember that the Play Store app lives on a separate branch from main; main is the branch current users run.
- Never add new blocks to Grana screens for notices, confirmations or questions; show them as floating windows, like the bank-notice confirmation window (author, 07/11/2026).
- Grana wallet views: 'Principal' counts only the Principal wallet's own entries plus the confirmed leftover; 'Total' sums all wallets and counts the leftover once; with a single wallet both views show the same numbers (author, 08/11/2026).
- Keep test-app-only changes off the GitHub main branch so they never reach the regular users' app.
- Every GranaPonto plan includes a 7-day free trial regardless of plan choice; payment is required only after the trial ends.
- Limit the semestral plan to a maximum of 3 wallets, counting the main wallet, which cannot be deleted.
- Set GranaPonto plan limits: never limit transaction history by plan; monthly plan gets only 2 cards; put all widgets in the semiannual plan.
<!-- end claude-reflect -->
