"""Front matter, Method A (heuristic evaluation) and Method B (cognitive walkthrough)."""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, PageBreak, Spacer, Table, TableStyle

from form_lib import (ACCENT, CONTENT_W, DARK, F, FB, GRID, HEAD, INK, INK2, INK3, LINE, PAPER2, SOFT, Banner,
                      ChoiceRow, Dropdown, P, Rule, TextBox, bullets, callout, labelled, pairs, tbl, txt)

SEV = ['-', '0', '1', '2', '3', '4']
SEV_COLORS = ['#e9f6ee', '#f0f6e4', '#fff6d6', '#ffe6c7', '#ffd0c4']


class Hero(Flowable):
    """Dark title block with the app icon."""

    def wrap(self, aw, ah):
        self.width, self.height = aw, 40 * mm
        return self.width, self.height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        c.setFillColor(DARK)
        c.roundRect(0, 0, w, h, 3 * mm, stroke=0, fill=1)
        c.saveState()  # keep the glow inside the rounded block
        clip = c.beginPath()
        clip.roundRect(0, 0, w, h, 3 * mm)
        c.clipPath(clip, stroke=0, fill=0)
        c.setFillColor(colors.HexColor('#3a1a10'))
        c.circle(w - 14 * mm, h - 6 * mm, 30 * mm, stroke=0, fill=1)
        c.restoreState()
        # icon
        c.setFillColor(ACCENT)
        c.roundRect(7 * mm, h - 20 * mm, 13 * mm, 13 * mm, 3.4 * mm, stroke=0, fill=1)
        c.setStrokeColor(DARK)
        for rx, ry, lw, a in ((4.6, 3.0, 0.5, 0.4), (3.0, 2.0, 0.55, 0.65)):
            c.setLineWidth(lw)
            c.setStrokeColor(colors.Color(0.04, 0.04, 0.05, alpha=a))
            c.ellipse(13.5 * mm - rx * mm, h - 13.5 * mm - ry * mm, 13.5 * mm + rx * mm, h - 13.5 * mm + ry * mm)
        c.setFillColor(DARK)
        c.ellipse(13.5 * mm - 1.5 * mm, h - 13.5 * mm - 0.95 * mm, 13.5 * mm + 1.5 * mm, h - 13.5 * mm + 0.95 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor('#ff7a3d'))
        c.setFont(FB, 7.6)
        c.drawString(25 * mm, h - 11 * mm, 'RABBIT HOLE  ·  USABILITY EVALUATION')
        c.setFillColor(colors.white)
        c.setFont(FB, 19)
        c.drawString(25 * mm, h - 19.5 * mm, txt('Heuristic & Usability'))
        c.drawString(25 * mm, h - 27.5 * mm, 'Evaluation Pack')
        c.setFont(F, 8)
        c.setFillColor(colors.HexColor('#c8c8d0'))
        c.drawString(7 * mm, 5.2 * mm, txt('Eight complementary methods  ·  fillable PDF  ·  for the popup and the full dashboard'))


def front(ctx) -> list:
    pm = ctx['pm']
    pg = lambda k: f"p. {pm.get(k, '–')}"
    out: list = [Hero(), Spacer(1, 3 * mm)]
    out.append(P(
        'This pack lets a team <b>inspect</b> Rabbit Hole against recognised usability heuristics, <b>observe</b> real people using it, '
        '<b>measure</b> how usable and trustworthy it feels, and <b>audit</b> accessibility and failure behaviour — then <b>consolidate</b> everything '
        'into one prioritised list. Every box on a blue background is a fillable field. It is a <b>template</b>: it contains no results, and nothing '
        'in it should be read as evidence that the product passes any method.'))

    out.append(P('How the pack fits together', 'h2'))
    rows = [['', 'Method', 'Who', 'Time', 'What you produce', 'Page']]
    meths = [
        ('A', 'Heuristic evaluation (Nielsen’s 10)', '3–5 evaluators, independently', '60–90 min', 'Severity-rated problems per heuristic', 'A'),
        ('B', 'Cognitive walkthrough', '2–3 evaluators', '45 min', 'Step-level learnability failures for 7 tasks', 'B'),
        ('C', 'Moderated think-aloud test', '5 target users + facilitator + observer', '30–40 min each', 'Observer log, task success, time, SEQ', 'C'),
        ('D', 'System Usability Scale (SUS)', 'The same 5 users', '3 min each', 'One 0–100 usability score per user', 'D'),
        ('E', 'Relevance & trust survey', 'The same 5 users', '10 min each', 'Precision@5, Likert ratings, NPS', 'E'),
        ('F', 'Accessibility audit (WCAG 2.2 AA)', '1–2 evaluators + tools', '45 min', 'Pass / fail per success criterion', 'F'),
        ('G', 'Error-state & performance matrix', '1–2 evaluators', '30 min', 'Expected vs observed behaviour, timings', 'G'),
        ('H', 'A/B experiment plan', 'Product team', '30 min', 'Four pre-registered experiments', 'H'),
        ('9', 'Consolidation & sign-off', 'Facilitator', '45 min', 'Merged findings, matrix, decision', 'I'),
    ]
    for letter, name, who, t, what, key in meths:
        rows.append([P(f'<b>{letter}</b>', 'centerb'), P(f'<b>{name}</b>', 'cell'), P(who, 'cell'), P(t, 'cell'), P(what, 'cell'), P(pg(key), 'center')])
    out.append(tbl(rows, [8 * mm, 54 * mm, 42 * mm, 20 * mm, 48 * mm, 10 * mm], HEAD + GRID + [('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#faf9f6')])], repeat=1))
    out.append(P('Part 10 (the last page) holds the facilitator’s hypotheses. <b>Evaluators must not read it until they have finished Methods A and B.</b>', 'small'))

    out.append(P('Severity scale (use it everywhere)', 'h2'))
    sev_rows = [['Rating', 'Meaning', 'Think about']]
    labels = [('0', 'Not a usability problem', 'You looked at it and disagree that it is one.'),
              ('1', 'Cosmetic', 'Fix only if there is spare time.'),
              ('2', 'Minor', 'Low priority; slows or mildly annoys a few people.'),
              ('3', 'Major', 'Important to fix; many people stumble, or a few fail the task.'),
              ('4', 'Catastrophic', 'Must be fixed before release; blocks the task or damages trust / privacy.')]
    for n, name, desc in labels:
        sev_rows.append([P(f'<b>{n}</b>', 'centerb'), P(f'<b>{name}</b>', 'cell'), P(desc, 'cell')])
    t = tbl(sev_rows, [16 * mm, 40 * mm, 126 * mm], HEAD + GRID + [('BACKGROUND', (0, i + 1), (0, i + 1), colors.HexColor(SEV_COLORS[i])) for i in range(5)], repeat=1)
    out.append(t)
    out.append(P('Rate each problem on three things and then give <b>one</b> number: <b>frequency</b> (how many users meet it), <b>impact</b> '
                 '(how hard it is to overcome) and <b>persistence</b> (a one-off or every time?). Judge the problem, not your preference.', 'small'))

    out.append(PageBreak())
    out.append(Banner('P0', '0', 'Before you start', 'Part 0 · everyone', 'Ground rules, test environment and evaluator details'))
    out.append(Spacer(1, 2.5 * mm))
    out.append(P('Ground rules', 'h2'))
    out += bullets([
        '<b>Work alone first.</b> Do not compare notes until everyone has finished; independent evaluation finds more problems and avoids group-think.',
        '<b>Go through the interface twice</b>: once for the overall flow, once screen by screen and element by element.',
        '<b>One problem per row.</b> Say <i>where</i> it is, <i>what</i> happens, <i>why</i> it matters to a user, and <i>how</i> you would fix it. Quote the exact on-screen words.',
        '<b>Rate honestly.</b> “0 — no problem found” is a valid, useful answer. Note strengths too: they tell the team what to keep.',
        '<b>Privacy.</b> Do not type real passwords, API keys or other people’s personal data into this form. Observed sessions need the participant’s consent (Method C).',
        '<b>Save a copy per evaluator</b> (for example <font face="Courier">RabbitHole-Eval-AB.pdf</font>) and send it to the facilitator.',
    ])
    out.append(Spacer(1, 1 * mm))
    out.append(callout(
        '<b>Test environment.</b> Build with <font face="Courier">npm run build</font>, open <font face="Courier">chrome://extensions</font>, turn on Developer mode, '
        '<b>Load unpacked</b> → choose <font face="Courier">dist/</font>, and pin the icon. Use a fresh Chrome profile with default settings. '
        'Test on: a YouTube video, a Reddit thread, a Substack article, a Netflix title page (optional — needs your own subscription; never share credentials or capture DRM video) and one other website. '
        'No network or no subscription? Run <font face="Courier">npm run dev:ui</font> and open <font face="Courier">http://localhost:5199/?data=docs</font> — the same interface with built-in sample data.'))
    out.append(Spacer(1, 2 * mm))
    out.append(P('Checklist', 'h3'))
    out.append(ChoiceRow('check', 'P0_env', [
        ('loaded', 'Extension loaded from dist/'), ('fresh', 'Fresh profile, default settings'), ('detect', 'Page detection ON'),
        ('net', 'Normal network'), ('pages', 'Test pages open'), ('size', 'Popup at 480 × 600'),
    ], tip='environment checklist'))
    out.append(Spacer(1, 2 * mm))

    out.append(P('Evaluator and session', 'h2'))
    half = CONTENT_W
    out.append(pairs([
        [('Name', TextBox('P0_name', height=5.8 * mm)), ('Initials / ID', TextBox('P0_id', height=5.8 * mm))],
        [('Date', TextBox('P0_date', height=5.8 * mm)), ('Start / end time', TextBox('P0_time', height=5.8 * mm))],
        [('Role', TextBox('P0_role', height=5.8 * mm, tip='e.g. UX designer, developer, product, domain novice')), ('Experience (years)', TextBox('P0_exp', height=5.8 * mm))],
        [('Chrome version', TextBox('P0_chrome', height=5.8 * mm)), ('OS / device', TextBox('P0_os', height=5.8 * mm))],
        [('Extension version', TextBox('P0_ext', height=5.8 * mm, value=ctx['version'])), ('Display / zoom', TextBox('P0_display', height=5.8 * mm, tip='screen size, scaling, browser zoom'))],
    ], half))
    out.append(Spacer(1, 1.5 * mm))
    out.append(labelled('Data used', ChoiceRow('check', 'P0_data', [('live', 'Live Reddit / Substack'), ('sample', 'Sample data (dev preview)'), ('netflix', 'Netflix tested')]), CONTENT_W))
    out.append(labelled('Input', ChoiceRow('check', 'P0_input', [('mouse', 'Mouse'), ('kbd', 'Keyboard only'), ('sr', 'Screen reader'), ('touch', 'Touch')]), CONTENT_W))
    out.append(labelled('Methods you completed', ChoiceRow('check', 'P0_methods', [(m, m) for m in 'ABCDEFGH'], gap=6 * mm), CONTENT_W))
    out.append(Spacer(1, 1.5 * mm))
    out.append(P('Familiarity (how well do you know these?)', 'h3'))
    fam = [['', P('1 never', 'center'), P('2', 'center'), P('3', 'center'), P('4', 'center'), P('5 daily', 'center')]]
    for key, label in (('reddit', 'Reddit'), ('substack', 'Substack / newsletters'), ('youtube', 'YouTube'), ('netflix', 'Netflix')):
        fam.append([P(label, 'cell'), ChoiceRow('radio', f'P0_fam_{key}', [(str(i), str(i)) for i in range(1, 6)], spread=True)] + [''] * 4)
    t = tbl(fam, [42 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm], GRID + HEAD + [('SPAN', (1, i), (5, i)) for i in range(1, 5)], valign='MIDDLE')
    # header cells are spaced to match the spread radios
    out.append(t)
    return out


# ── Method A ────────────────────────────────────────────────────────────────────
HEURISTICS = [
    ('Visibility of system status',
     'The design should always keep users informed about what is going on, through appropriate feedback within a reasonable time.',
     ['Skeleton loaders and “Finding related writing…” while a search runs; is anything ever a blank screen?',
      'The context bar (“Watching — YouTube”) and the stats line (“Found N relevant posts · topics searched”): do they say what Rabbit Hole understood?',
      'The toolbar badge when a page is detected; whether stale or cached data is labelled (“flagged”) when Reddit is unavailable.']),
    ('Match between system and the real world',
     'The design should speak the users’ language: words, phrases and concepts familiar to them, in a natural and logical order.',
     ['Section names — Hot Right Now, Rising Fast, Most Discussed, Across Reddit — and the relevance labels Highly relevant / Very relevant / Related.',
      'Words such as “detection”, “growth”, “bridge”, “Use this page”, “subreddit”: would a first-time user know them?',
      'Emoji used as section icons (flame, chart, speech bubble, globe): meaningful, or decorative noise?']),
    ('User control and freedom',
     'Users often choose functions by mistake and need a clearly marked “emergency exit” to leave the unwanted state without extended dialogue.',
     ['Clearing a search (× button, Esc), “Back to trending”, switching tabs mid-load, closing the popup while loading.',
      'Turning page detection off per platform; “Clear cache” and “Delete everything” (Settings → Your data): are they reversible or confirmed?',
      'Can the user always tell how to get out of the Reddit-results view back to the original context?']),
    ('Consistency and standards',
     'Users should not have to wonder whether different words, situations or actions mean the same thing. Follow platform and industry conventions.',
     ['Button labels and behaviour on cards: “Read on Substack”, “Open Reddit”, “Find deeper reading →”, “See what Reddit thinks →”.',
      'Popup versus full dashboard: same names, same order, same controls? Light versus dark theme.',
      'Keyboard conventions: “/” focuses search, ← → switch tabs, Esc clears. Do they match what users know from other tools?']),
    ('Error prevention',
     'Good error messages matter, but the best designs carefully prevent problems from occurring in the first place.',
     ['Nothing is read from an unsupported page until the user presses “Use this page”; optional permissions are requested only when a feature needs them.',
      'API-key fields (masked, write-only) and the destructive “Delete everything” button: can they be triggered by accident?',
      'Empty or whitespace-only searches; searching while offline; double-clicking a bridge button.']),
    ('Recognition rather than recall',
     'Minimise memory load by making elements, actions and options visible. The user should not have to remember information from one part to another.',
     ['Is the current context (what is being searched) always visible while reading results?',
      'Topic chips, tab counts and labels versus hidden gestures; is the “/” shortcut discoverable (placeholder, tooltip)?',
      'Does the “Why this is relevant” box show the reason on the card, or must the user remember what the label means?']),
    ('Flexibility and efficiency of use',
     'Shortcuts — hidden from novices — speed up interaction for experts, so the design serves both inexperienced and experienced users.',
     ['Auto-selecting Related Reading on a video and Trending elsewhere; one-click topic filters; one-click bridges between Reddit and Substack.',
      'Keyboard-only use (/, Enter, Esc, ← →, Home/End); the full dashboard for wide screens; AI layer and API keys for power users.',
      'How many steps from “watching a video” to “reading a relevant article”? (Target for task T1: ≤ 30 s.)']),
    ('Aesthetic and minimalist design',
     'Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information competes with the relevant units.',
     ['Information density of a card at 480 × 600: label, source, date, excerpt, tags, “Why”, buttons. What could go?',
      'Visual hierarchy and contrast in dark and light themes; the colour accent used only for the primary action and status.',
      'Motion: shimmer, rise-in; is it calm and does it respect reduced-motion settings?']),
    ('Help users recognise, diagnose and recover from errors',
     'Error messages should be expressed in plain language (no codes), precisely indicate the problem, and constructively suggest a solution.',
     ['“Reddit blocked the request” state: cause in plain words, one clear next action (Try again · Open Reddit), stale data flagged.',
      'No results; Netflix labels hidden (“We couldn’t automatically identify what you’re watching”); invalid API key; permission declined.',
      'Is the user ever blamed, left with a dead end, or shown made-up filler content?']),
    ('Help and documentation',
     'It is best if the system needs no extra explanation, but it may be necessary to provide documentation to help users complete tasks.',
     ['“What Rabbit Hole used” on the context bar, the “Private by design” footer and Settings → Privacy: findable and understandable at first use?',
      'Help text in Settings (especially API & Integrations and Your data); how to obtain a search key; tooltips explaining relevance.',
      'Is there any first-run explanation of what the extension reads and sends? (Facilitator note: see Part 10.)']),
]


def heuristic_block(n: int, title: str, definition: str, checks: list[str]) -> Flowable:
    head = tbl([[P(f'<b>H{n}</b>', 'centerb'), P(f'<b>{title}</b>', 'cell'),
                 ChoiceRow('check', f'A_H{n}_none', [('none', 'No problem found')], size=3.2 * mm, fsize=7.4)]],
               [10 * mm, 112 * mm, 60 * mm],
               [('BACKGROUND', (0, 0), (-1, -1), SOFT), ('TEXTCOLOR', (0, 0), (0, 0), ACCENT)], valign='MIDDLE')
    info = tbl([[P(definition, 'ital')], [P('<b>Check in Rabbit Hole</b>', 'label')] , [bullets(checks)]], [CONTENT_W],
               [('LEFTPADDING', (0, 0), (-1, -1), 2.4 * mm), ('TOPPADDING', (0, 0), (-1, -1), 0.5 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5 * mm)])
    rows = [[P('Where (screen / element)', 'label'), P('Problem — what happens and why it matters', 'label'), P('Suggested fix', 'label'), P('Severity', 'label')]]
    for i in (1, 2):
        rows.append([TextBox(f'A_H{n}_p{i}_where', height=11 * mm, multiline=True, size=7.6),
                     TextBox(f'A_H{n}_p{i}_problem', height=11 * mm, multiline=True, size=7.6),
                     TextBox(f'A_H{n}_p{i}_fix', height=11 * mm, multiline=True, size=7.6),
                     Dropdown(f'A_H{n}_p{i}_sev', SEV, width=13 * mm, tip=f'H{n} problem {i} severity 0-4')])
    problems = tbl(rows, [32 * mm, 72 * mm, 56 * mm, 22 * mm], [('LINEBELOW', (0, 0), (-1, 0), 0.4, LINE), ('TOPPADDING', (0, 0), (-1, -1), 0.7 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.9 * mm)])
    box = Table([[head], [info], [problems]], colWidths=[CONTENT_W])
    box.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#b9b2a3')), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                             ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return KeepTogether([box, Spacer(1, 2.6 * mm)])


def method_a(ctx) -> list:
    out: list = [PageBreak(), Banner('A', 'A', 'Heuristic evaluation — Nielsen’s 10 usability heuristics', '3–5 evaluators · 60–90 min', 'Inspect the popup and the dashboard; no users needed'), Spacer(1, 2 * mm)]
    out.append(P('Walk through the interface at least twice. For each heuristic, either tick <b>No problem found</b> or record up to two problems '
                 '(there is room for more in the notes at the end). Severity uses the 0–4 scale on page 1; use <b>-</b> if you have not rated it.', 'small'))
    out.append(Spacer(1, 1.5 * mm))
    for i, (title, definition, checks) in enumerate(HEURISTICS, start=1):
        out.append(heuristic_block(i, title, definition, checks))
    out.append(KeepTogether([
        P('Strengths worth keeping', 'h3'), TextBox('A_strengths', height=16 * mm, multiline=True, tip='what the design does well'),
        Spacer(1, 2 * mm), P('Other problems or overall impression', 'h3'), TextBox('A_overall', height=22 * mm, multiline=True),
    ]))
    return out


# ── Method B ────────────────────────────────────────────────────────────────────
TASKS = [
    dict(id='T1', title='From a video to a related article', core=True,
         scenario='You are watching a YouTube video about AI agents and want something worth reading about it.',
         success='A related Substack article opens in a new tab.',
         steps=['Click the Rabbit Hole toolbar icon (a badge shows that the page was recognised).',
                'The popup opens on <b>Related Reading</b>; the context bar says “Watching — YouTube” with topics.',
                'Scan the article cards (label · publication · date · excerpt) and choose one.',
                'Click <b>Read on Substack</b> on that card.']),
    dict(id='T2', title='Understand why an article is recommended', core=True,
         scenario='You see “Highly relevant” on the top card and wonder whether to trust it.',
         success='You can explain, in your own words, what the label and the reason are based on.',
         steps=['Find the relevance label on the card.',
                'Find and read the <b>Why this is relevant</b> box under the excerpt.',
                'Check the stats line (“Found N relevant posts · topics searched”) and the matched tags.',
                'Decide whether to open the article — and say what would make you distrust it.']),
    dict(id='T3', title='Find what is trending on Reddit', core=True,
         scenario='You want to know what people are discussing on Reddit right now in Technology.',
         success='A thread you consider worth reading opens on Reddit.',
         steps=['Switch to the <b>Trending Reddit</b> tab (click it, or press ←/→).',
                'Choose the <b>Technology</b> topic chip.',
                'Compare Hot Right Now, Rising Fast, Most Discussed and Across Reddit; read score, comments and the growth label.',
                'Click <b>Open Reddit</b> on a thread.']),
    dict(id='T4', title='Bridge between Reddit and Substack', core=True,
         scenario='You are reading a Reddit thread and want deeper writing on it — then want to see how Reddit reacted to an article.',
         success='You reach related articles from a thread, and discussion from an article.',
         steps=['On a Reddit thread page, open Rabbit Hole; it offers <b>Find deeper reading →</b>.',
                'Click it: Related Reading searches for the thread’s topic.',
                'Open a Substack article, reopen the popup and click <b>See what Reddit thinks →</b>.',
                'Return with <b>Back to trending</b> and confirm you know where you are.']),
    dict(id='T5', title='Check and control what is read', core=True,
         scenario='You are not sure what this extension looks at and want to switch it off for one site.',
         success='You can state what is read, stored and sent, and you switched detection off.',
         steps=['Open <b>What Rabbit Hole used</b> on the context bar or click <b>Private by design</b> in the footer.',
                'Open Settings (gear) → <b>Privacy</b> and read what is read, stored and sent.',
                'Switch page detection off for one platform; reopen the popup on that platform.',
                'Read “Page detection is off” and find <b>Turn on detection</b>.']),
    dict(id='T6', title='Search when nothing is detected', core=False,
         scenario='You are on Netflix (or any other site) where Rabbit Hole cannot tell what you are watching.',
         success='You find and open a relevant article by searching for a topic.',
         steps=['Open the popup; read the fallback message (“We couldn’t automatically identify what you’re watching”).',
                'Type a topic into “Search Reddit or Substack…” — or, on any other site, press <b>Use this page</b>.',
                'Press Enter and watch the loading state (“Finding related writing…”).',
                'Open a result.']),
    dict(id='T7', title='Recover from a failure and tidy up', core=False,
         scenario='Reddit is unreachable (DevTools → Network → Offline). Afterwards you want to remove what Rabbit Hole stored.',
         success='You understand the message, retry successfully and find the data controls.',
         steps=['Open Trending while offline; read the message and what it offers.',
                'Check whether cached results are shown and marked as stale.',
                'Go back online and click <b>Try again</b>.',
                'Open Settings → <b>Your data</b>; read what <b>Clear cache</b> and <b>Delete everything</b> do.']),
]

QUESTIONS = [
    ('Q1', 'Will the user try to achieve the right effect?', 'Do they know this step is needed?'),
    ('Q2', 'Will the user notice that the correct action is available?', 'Is the control visible?'),
    ('Q3', 'Will the user associate the action with the effect they want?', 'Does the label / icon make sense?'),
    ('Q4', 'After the action, will the user see that progress is being made?', 'Is there clear feedback?'),
]


def task_block(t: dict) -> Flowable:
    tid = t['id']
    head = tbl([[P(f"<b>{tid}</b>", 'centerb'), P(f"<b>{t['title']}</b>  {'· core task' if t['core'] else '· optional'}", 'cell')]], [12 * mm, CONTENT_W - 12 * mm],
               [('BACKGROUND', (0, 0), (-1, -1), SOFT)], valign='MIDDLE')
    brief = tbl([[P(f"<b>Scenario.</b> {t['scenario']}  <b>Done when:</b> {t['success']}", 'small')]], [CONTENT_W],
                [('TOPPADDING', (0, 0), (-1, -1), 0.8 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8 * mm), ('LEFTPADDING', (0, 0), (-1, -1), 2.4 * mm)])
    rows = [[P('#', 'label'), P('Correct action (what the interface offers)', 'label')] + [P(q[0], 'centerb') for q in QUESTIONS] + [P('Failure story / notes', 'label')]]
    for i, step in enumerate(t['steps'], start=1):
        rows.append([P(str(i), 'centerb'), P(step, 'cell')] +
                    [ChoiceRow('check', f'B_{tid}_s{i}_{q[0]}', [('ok', '')], spread=True, tip=f'{tid} step {i} {q[0]} yes') for q in QUESTIONS] +
                    [TextBox(f'B_{tid}_s{i}_note', height=9.2 * mm, multiline=True, size=7.4)])
    steps = tbl(rows, [6 * mm, 62 * mm, 8.5 * mm, 8.5 * mm, 8.5 * mm, 8.5 * mm, 80 * mm], GRID + HEAD, repeat=1, valign='MIDDLE', pad=1.1 * mm)
    foot = tbl([[P('<b>Overall</b> for this task', 'label'),
                 ChoiceRow('radio', f'B_{tid}_overall', [('easy', 'Learnable at first sight'), ('diff', 'Learnable with effort'), ('fail', 'Likely to fail')]),
                 P('Unticked Q boxes = predicted failure.', 'tiny')]],
               [32 * mm, 108 * mm, 42 * mm], valign='MIDDLE', pad=1 * mm)
    box = Table([[head], [brief], [steps], [foot]], colWidths=[CONTENT_W])
    box.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#b9b2a3')), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                             ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return KeepTogether([box, Spacer(1, 3 * mm)])


def method_b(ctx) -> list:
    out: list = [PageBreak(), Banner('B', 'B', 'Cognitive walkthrough', '2–3 evaluators · 45 min', 'Predict where a first-time user will go wrong, step by step'), Spacer(1, 2 * mm)]
    out.append(P('Take the role of a <b>first-time user who knows what they want but has never seen Rabbit Hole</b> (the curious viewer or the trend watcher from the project report). '
                 'For every step of every task, answer the four questions below. <b>Tick the box when the answer is YES.</b> Every unticked box is a predicted failure: '
                 'write the “failure story” — who would fail, why, and what they would do instead.', 'small'))
    out.append(Spacer(1, 1.5 * mm))
    q_rows = [[P('<b>Question</b>', 'label'), P('<b>Ask yourself</b>', 'label'), P('<b>Look for</b>', 'label')]]
    for q, a, b in QUESTIONS:
        q_rows.append([P(f'<b>{q}</b>', 'cellb'), P(a, 'cell'), P(b, 'cell')])
    out.append(tbl(q_rows, [19 * mm, 107 * mm, 56 * mm], HEAD + GRID, repeat=1))
    out.append(Spacer(1, 3 * mm))
    out.append(P('T1–T5 are the core tasks (they are measured again in Method C); T6 and T7 cover the fallback and failure paths.', 'tiny'))
    for t in TASKS:
        out.append(task_block(t))
    out.append(KeepTogether([P('Walkthrough summary', 'h3'),
                             labelled('Most serious failure', TextBox('B_worst', height=11 * mm, multiline=True), CONTENT_W, 34 * mm),
                             labelled('Quick wins', TextBox('B_quick', height=11 * mm, multiline=True), CONTENT_W, 34 * mm)]))
    return out
