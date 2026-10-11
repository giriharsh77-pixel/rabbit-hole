# /brag plan — Rabbit Hole (v2: Netflix · four tabs)

Update of the first video (YouTube + Trending Reddit + Substack), rebuilt for the new version. The focus is what changed: one exact Netflix title, four tabs about it, and search for any title.

## The answers
- **What is it?** A Chrome extension that knows exactly which Netflix movie or show you're watching and gives you four tabs about it: what Reddit says, what's been written, who's in it, and what to watch next.
- **Who is it for?** Netflix viewers who finish an episode and want the conversation, the reviews and the cast without googling and tab-hopping.
- **What sets it apart?** It resolves the exact title (The Office U.S., not the UK one), so Discuss shows the show's own subreddit and drops look-alikes — "The Office" never brings up office politics. Read pulls essays and real news (Variety, Deadline…) from sources the user picks. About lists the cast with their X and Instagram. Watch next links titles by shared cast and creators. Off Netflix, you search any title. It reads only Netflix, only when opened.
- **Most impressive / funniest claim:** "Reddit on this episode. Not office politics." — the round-2 fix, said plainly.
- **Visual hook:** the logo's rings as a tunnel — falling into the rabbit hole — that lands inside the product.
- **Real UI to show:** the subject bar ("Watching · The Office (2005) · Netflix · S1 E5"), Discuss with the r/DunderMifflin chip and the Most relevant ⇄ Newest switch, Read with a Variety card and "Why this is relevant", About's cast rows with X / Instagram buttons, Watch next's "With Steve Carell and Ed Helms", and the title search typing "sacred ga".
- **Tone:** `default` — punchy, clean; the product's own charcoal + electric orange.
- **Share caption:** Rabbit Hole knows exactly what you're watching on Netflix — and shows what Reddit says about it, the essays and news worth reading, who's in it, and what to watch next.

## Source material and honesty
- **The UI is the real thing:** each popup state is the product's own rendered markup and stylesheet, frozen from the live preview build and animated in place.
- **Reddit threads** are the preview's invented sample threads (the project labels them as such).
- **News headlines, cast, social handles and Watch next titles are the product's real output:** headlines from Variety's and Deadline's public per-title feeds (captured 10 October 2026), facts from live Wikidata. Nothing was rewritten.
- **Claims used, all true of the build:** knows what you're watching on Netflix; Reddit threads about the episode with the show's own subreddit first and off-topic threads dropped; Most relevant / Newest; essays, reviews and news from sources you pick; cast with X and Instagram; Watch next by shared cast and creators; search any movie or show; Chrome extension; private by design. Ratings and Netflix-India availability are **not** shown (they need the backend's keys and aren't verified live). "Open source" is not claimed — the outro says "github".

## Format
Landscape 1920×1080, 30 fps, 24.0 s. Music 120 BPM in D major (I–V–vi–IV); scene starts on the half-second beat grid.

## Storyboard (seconds)
| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.0–2.5 | **Hook** | Orange rings rush outward. "Every show has a rabbit hole." From 2.0 the camera dives into the centre. | Sub boom, filtered arpeggio opening up, whoosh into the dive; groove from 2.0. |
| 2 | 2.5–5.0 | **Reveal** | The real popup rises in on The Office S1E5. Left: logo + "Rabbit Hole", "Knows exactly what you're watching." The subject bar glows; chips pop. | Impact at 2.5; four rising blips on the chips. |
| 3 | 5.0–8.5 | **Discuss** | Push in on the threads; r/DunderMifflin lights up. Cursor clicks **Newest**; the list swaps. "Reddit on this episode. Not office politics." | Bell on the subreddit chip; click + small whoosh. |
| 4 | 8.5–12.0 | **Read** | Cursor clicks **Read**; news cards in. Push in on a Variety card: "Highly relevant" pops, "Why this is relevant" glows. "Essays, reviews and news — from sources you pick." | Click, whoosh, in-key sparkle. |
| 5 | 12.0–15.0 | **About** | Cursor clicks **About**; the panel scrolls to the cast; X and Instagram buttons pop down the list. "Who's in it — on X and Instagram." | Click; six pentatonic ticks. |
| 6 | 15.0–18.0 | **Watch next** | Cursor clicks **Watch next**; "With Steve Carell and Ed Helms" glows. "Same cast. Same creators. What to watch next." | Click; two soft bells. |
| 7 | 18.0–20.5 | **Any title** | The popup slides to a non-Netflix tab; "sacred ga" types into the search; the Wikidata result drops in. "Not on Netflix? Search any movie or show." | Drums out; typing ticks; dropdown chime; riser into the outro. |
| 8 | 20.5–24.0 | **Outro** | Rings behind the logo. "Rabbit Hole" · "Go deeper on what you watch." · "Chrome extension for Netflix · private by design · github.com/giriharsh77-pixel/rabbit-hole". | Final chord hit, bells, reverb tail. |

Readability (≈0.3 s per word once fully in): 1 → 1.8 / 1.9 · 2 → 1.5 / 1.9 · 3 → 2.1 / 2.9 · 4 → 2.4 / 2.8 · 5 → 2.1 / 2.5 · 6 → 2.4 / 2.4 · 7 → 1.8 / 1.9 · 8 → 2.7 / 3.0.

## Poster
The settled Read frame at 11.0 s (Variety card, "Highly relevant", "Why this is relevant" lit, caption fully in) — baked in as frame 0 of `brag.mp4`.

## Build
`work/snapshot.mjs` freezes the six popup states from `npm run dev:ui` · `work/composition.html` animates them (every frame a pure function of time) · `work/synth.py` writes the score and effects as one piece → `audio.wav` (loudnorm −15 LUFS) · `work/render.mjs video 11.0` renders `brag.mp4`.
