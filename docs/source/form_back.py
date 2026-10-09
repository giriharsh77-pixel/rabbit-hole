"""Methods C–H, consolidation (Part 9) and facilitator notes (Part 10)."""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Spacer, Table, TableStyle

from form_front import SEV, TASKS
from form_lib import (ACCENT, CONTENT_W, DARK, GRID, HEAD, INK2, LINE, PAPER2, SOFT, Banner, ChoiceRow, Dropdown, P,
                      TextBox, bullets, callout, labelled, pairs, tbl)

HEUR_CODES = ['-'] + [f'H{i}' for i in range(1, 11)] + ['WCAG', 'Other']
BORDER = colors.HexColor('#b9b2a3')


def boxed(rows, widths=None):
    t = Table([[r] for r in rows], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, BORDER), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                           ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return t


def card_head(code, title, extra=''):
    return tbl([[P(f'<b>{code}</b>', 'centerb'), P(f'<b>{title}</b> {extra}', 'cell')]], [12 * mm, CONTENT_W - 12 * mm],
               [('BACKGROUND', (0, 0), (-1, -1), SOFT)], valign='MIDDLE')


def scale_table(prefix, items, low='Strongly disagree', high='Strongly agree', score_col=False):
    """Statements with a 1–5 radio group per row (and an optional score box)."""
    head = [P('#', 'label'), P('Statement', 'label')]
    labels = [f'1<br/>{low.split()[0]}<br/>{" ".join(low.split()[1:])}', '2', '3', '4', f'5<br/>{high.split()[0]}<br/>{" ".join(high.split()[1:])}']
    head += [P(l, 'tinyc') for l in labels]
    stmt_w = 82 * mm if score_col else 100 * mm
    widths = [7 * mm, stmt_w] + [15 * mm] * 5
    if score_col:
        head.append(P('Score', 'tinyc'))
        widths.append(18 * mm)
    rows, spans = [head], []
    for i, text in enumerate(items, start=1):
        r = [P(str(i), 'centerb'), P(text, 'cell'), ChoiceRow('radio', f'{prefix}_q{i}', [(str(k), str(k)) for k in range(1, 6)], spread=True), '', '', '', '']
        if score_col:
            r.append(TextBox(f'{prefix}_s{i}', height=5.6 * mm, size=8, tip=f'{prefix} item {i} contribution 0-4'))
        rows.append(r)
        spans.append(('SPAN', (2, i), (6, i)))
    return tbl(rows, widths, HEAD + GRID + spans, repeat=1, valign='MIDDLE', pad=1 * mm)


# ── Method C ────────────────────────────────────────────────────────────────────
def method_c(ctx):
    out = [PageBreak(), Banner('C', 'C', 'Moderated think-aloud usability test', '5 users · 30–40 min each', 'One facilitator talks, one observer logs. Duplicate these pages for each participant.'), Spacer(1, 2 * mm)]
    out.append(P('Participant', 'h2'))
    out.append(pairs([
        [('Participant ID', TextBox('C_pid', height=5.8 * mm, tip='e.g. P1')), ('Date / time', TextBox('C_datetime', height=5.8 * mm))],
        [('Facilitator', TextBox('C_facilitator', height=5.8 * mm)), ('Observer', TextBox('C_observer', height=5.8 * mm))],
        [('Age band', Dropdown('C_age', ['-', '18-24', '25-34', '35-44', '45-54', '55+'], width=30 * mm)), ('Occupation', TextBox('C_job', height=5.8 * mm))],
    ]))
    out.append(Spacer(1, 1 * mm))
    out.append(labelled('Reads newsletters', ChoiceRow('radio', 'C_reads_news', [('never', 'Never'), ('monthly', 'Monthly'), ('weekly', 'Weekly'), ('daily', 'Daily')]), CONTENT_W))
    out.append(labelled('Uses Reddit', ChoiceRow('radio', 'C_uses_reddit', [('never', 'Never'), ('monthly', 'Monthly'), ('weekly', 'Weekly'), ('daily', 'Daily')]), CONTENT_W))
    out.append(labelled('Consent', ChoiceRow('check', 'C_consent', [
        ('informed', 'Informed consent given'), ('notes', 'Written notes OK'), ('rec', 'Screen / audio recording OK (optional)'),
        ('stop', 'Told they may stop at any time'), ('nodata', 'No real personal data entered')]), CONTENT_W))
    out.append(Spacer(1, 2 * mm))
    out.append(callout([
        P('<b>Facilitator script (read, do not improvise)</b>', 'cell'),
        *bullets([
            '“We are testing the extension, not you — nothing you do is wrong. Please <b>think aloud</b>: say what you are looking at, what you expect, and anything unclear.”',
            'Neutral prompts only: “What are you thinking?” · “What did you expect to happen?” · “What would you do next?” Do not explain features, hint at buttons or defend the design.',
            'Hints in 3 levels: <b>1</b> general (“Is there anything on the screen that might help?”) · <b>2</b> specific area · <b>3</b> show it. Record the level; a level-3 hint counts as a failure. Stop a task after 3 minutes.',
        ])]))
    out.append(Spacer(1, 2 * mm))
    out.append(P('Before the tasks', 'h3'))
    out.append(labelled('“What do you think a tool called Rabbit Hole does?”', TextBox('C_pre_expect', height=11 * mm, multiline=True), CONTENT_W, 50 * mm))
    out.append(labelled('“What would you expect it to read about you?”', TextBox('C_pre_privacy', height=11 * mm, multiline=True), CONTENT_W, 50 * mm))

    out.append(PageBreak())
    out.append(P('Task log', 'h2'))
    out.append(P('Time each task from “go” until the success state in Method B (or until you stop it). <b>SEQ</b> (Single Ease Question), asked after each task: '
                 '“Overall, how easy or difficult was this task?” — 1 very difficult … 7 very easy.', 'small'))
    seq = ['-'] + [str(i) for i in range(1, 8)]
    for t in TASKS[:5]:
        tid = t['id']
        target = '  · target ≤ 30 s' if tid == 'T1' else ''
        r1 = tbl([[P('Start', 'label'), TextBox(f'C_{tid}_start', height=5.4 * mm, size=7.6), P('End', 'label'), TextBox(f'C_{tid}_end', height=5.4 * mm, size=7.6),
                   P('Time (s)', 'label'), TextBox(f'C_{tid}_secs', height=5.4 * mm, size=7.6), P('Errors', 'label'), TextBox(f'C_{tid}_errors', height=5.4 * mm, size=7.6),
                   P('Hint level', 'label'), Dropdown(f'C_{tid}_hint', ['-', '0', '1', '2', '3'], width=11 * mm, tip=f'{tid} highest hint level'),
                   P('SEQ', 'label'), Dropdown(f'C_{tid}_seq', seq, width=11 * mm, tip=f'{tid} SEQ 1-7')]],
                 [9 * mm, 15 * mm, 8 * mm, 15 * mm, 13 * mm, 14 * mm, 11 * mm, 12 * mm, 15 * mm, 14 * mm, 8 * mm, 14 * mm],
                 valign='MIDDLE', pad=0.7 * mm)
        r2 = tbl([[P('Result', 'label'), ChoiceRow('radio', f'C_{tid}_result', [('ok', 'Unassisted'), ('hint', 'With hint (1–2)'), ('fail', 'Failed / gave up')])]],
                 [14 * mm, CONTENT_W - 14 * mm], valign='MIDDLE', pad=0.9 * mm)
        r3 = tbl([[P('Observations, quotes, where they hesitated', 'label')], [TextBox(f'C_{tid}_obs', height=11 * mm, multiline=True, size=7.6)]], [CONTENT_W], pad=1 * mm)
        out.append(KeepTogether([boxed([card_head(tid, t['title'], target), r1, r2, r3]), Spacer(1, 2.4 * mm)]))
    out.append(P('<b>Optional tasks T6 / T7</b> — record result and notes here if you ran them.', 'small'))
    out.append(TextBox('C_optional', height=14 * mm, multiline=True))

    out.append(PageBreak())
    out.append(P('Critical incidents', 'h2'))
    out.append(P('Anything that slowed, confused, surprised or delighted the participant. Link it to a heuristic (H1–H10) or WCAG if you can.', 'small'))
    rows = [[P('Time', 'label'), P('Task', 'label'), P('What happened (and what they said)', 'label'), P('Heur.', 'label'), P('Sev.', 'label')]]
    for i in range(1, 9):
        rows.append([TextBox(f'C_inc{i}_time', height=9.5 * mm, size=7.6), Dropdown(f'C_inc{i}_task', ['-', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], width=12 * mm),
                     TextBox(f'C_inc{i}_what', height=9.5 * mm, multiline=True, size=7.6), Dropdown(f'C_inc{i}_heur', HEUR_CODES, width=14 * mm), Dropdown(f'C_inc{i}_sev', SEV, width=11 * mm)])
    out.append(tbl(rows, [16 * mm, 17 * mm, 116 * mm, 19 * mm, 14 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=1 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Debrief (after the tasks)', 'h2'))
    for key, q in (('useful', 'What was the most useful part? Why?'), ('confusing', 'What was the most confusing or annoying part?'),
                   ('reads', 'What do you think Rabbit Hole reads about you, and where does it send it? (compare with Part 10 facts)'),
                   ('trust', 'Did anything make you trust or distrust the recommendations?'),
                   ('change', 'If you could change one thing first, what would it be?'),
                   ('again', 'Would you use it again — when, and for what?')):
        out.append(KeepTogether([P(q, 'label'), TextBox(f'C_debrief_{key}', height=10 * mm, multiline=True, size=7.6), Spacer(1, 1.6 * mm)]))
    return out


# ── Method D ────────────────────────────────────────────────────────────────────
SUS_ITEMS = [
    'I think that I would like to use Rabbit Hole frequently.',
    'I found Rabbit Hole unnecessarily complex.',
    'I thought Rabbit Hole was easy to use.',
    'I think that I would need the support of a technical person to be able to use Rabbit Hole.',
    'I found the various functions in Rabbit Hole were well integrated.',
    'I thought there was too much inconsistency in Rabbit Hole.',
    'I would imagine that most people would learn to use Rabbit Hole very quickly.',
    'I found Rabbit Hole very cumbersome to use.',
    'I felt very confident using Rabbit Hole.',
    'I needed to learn a lot of things before I could get going with Rabbit Hole.',
]


def method_d(ctx):
    out = [PageBreak(), Banner('D', 'D', 'System Usability Scale (SUS)', 'same 5 users · 3 min each', 'Ten statements, answered straight after the tasks, without discussion'), Spacer(1, 2 * mm)]
    out.append(pairs([[('Participant ID', TextBox('D_pid', height=5.8 * mm)), ('Date', TextBox('D_date', height=5.8 * mm))]]))
    out.append(Spacer(1, 1.5 * mm))
    out.append(P('Participant instructions: “Please answer every statement, based on your experience with Rabbit Hole just now. Give your immediate reaction rather than thinking for long.”', 'small'))
    out.append(Spacer(1, 1 * mm))
    out.append(scale_table('D_sus', SUS_ITEMS, score_col=True))
    out.append(Spacer(1, 2 * mm))
    out.append(P('Scoring (facilitator)', 'h3'))
    out += bullets([
        '<b>Odd-numbered</b> statements (1, 3, 5, 7, 9): contribution = answer − 1.  <b>Even-numbered</b> (2, 4, 6, 8, 10): contribution = 5 − answer.',
        'Add the ten contributions (0–40), then multiply by <b>2.5</b>: the <b>SUS score is 0–100</b>. It is a score, not a percentage.',
        'Reading it: about <b>68</b> is average across products; roughly <b>80</b> and above is in the top tenth; below about <b>51</b> is poor (Sauro &amp; Lewis, 2016). With five users, report the range as well as the mean.',
    ])
    out.append(Spacer(1, 1.5 * mm))
    out.append(tbl([[P('Sum of contributions', 'label'), TextBox('D_sum', width=22 * mm, height=6 * mm), P('× 2.5 = SUS', 'label'), TextBox('D_score', width=22 * mm, height=6 * mm),
                     P('Band', 'label'), ChoiceRow('radio', 'D_band', [('poor', '< 51'), ('below', '51–67'), ('avg', '68–79'), ('good', '≥ 80')])]],
                   [32 * mm, 26 * mm, 22 * mm, 26 * mm, 12 * mm, 64 * mm], valign='MIDDLE', pad=0.9 * mm))
    out.append(Spacer(1, 2 * mm))
    out.append(P('All participants', 'h3'))
    hdr = [P(f'P{i}', 'centerb') for i in range(1, 6)] + [P('Mean', 'centerb'), P('Min–max', 'centerb')]
    row = [TextBox(f'D_all_p{i}', height=6 * mm, size=8) for i in range(1, 6)] + [TextBox('D_all_mean', height=6 * mm, size=8), TextBox('D_all_range', height=6 * mm, size=8)]
    out.append(tbl([hdr, row], [26 * mm] * 7, HEAD + GRID, valign='MIDDLE'))
    return out


# ── Method E ────────────────────────────────────────────────────────────────────
LIKERT = [
    'I understood what Rabbit Hole reads from the pages I visit.',
    'I understood what Rabbit Hole sends to other services.',
    'I felt in control of what Rabbit Hole does (for example, I could switch detection off).',
    'The recommended articles were relevant to what I was watching or reading.',
    'The relevance labels (Highly / Very relevant / Related) matched my own judgement.',
    '“Why this is relevant” helped me decide whether to open an article.',
    'The Trending tab showed me something I would not have found myself.',
    'Moving between Reddit and Substack (“Find deeper reading”, “See what Reddit thinks”) felt natural.',
    'I trust Rabbit Hole not to make things up (titles, authors, dates, links).',
    'I would use Rabbit Hole at least weekly.',
]


def precision_block(tag):
    head = pairs([[('Page / video title', TextBox(f'E_{tag}_title', height=5.8 * mm)), ('Topics in the context bar', TextBox(f'E_{tag}_topics', height=5.8 * mm))]], label_w=32 * mm)
    rows = [[P('#', 'label'), P('Article title — publication (as shown)', 'label'), P('Is it relevant to this page?', 'label'), P('“Why” box was…', 'label'), P('Label vs your view', 'label')]]
    for i in range(1, 6):
        rows.append([P(f'<b>{i}</b>', 'centerb'), TextBox(f'E_{tag}_a{i}_title', height=6.2 * mm, size=7.6),
                     ChoiceRow('radio', f'E_{tag}_a{i}_judge', [('rel', 'Relevant'), ('part', 'Partly'), ('no', 'Not')], size=3 * mm, fsize=7, gap=2 * mm),
                     Dropdown(f'E_{tag}_a{i}_why', ['-', 'Helpful', 'Vague', 'Wrong', 'Not seen'], width=23 * mm),
                     Dropdown(f'E_{tag}_a{i}_label', ['-', 'Fair', 'Too high', 'Too low', 'No label'], width=24 * mm)])
    tab = tbl(rows, [7 * mm, 72 * mm, 50 * mm, 26 * mm, 27 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=0.9 * mm)
    calc = tbl([[P('Relevant', 'label'), TextBox(f'E_{tag}_nrel', width=11 * mm, height=5.6 * mm), P('Partly', 'label'), TextBox(f'E_{tag}_npart', width=11 * mm, height=5.6 * mm),
                 P('Not', 'label'), TextBox(f'E_{tag}_nno', width=11 * mm, height=5.6 * mm), P('Precision@5 lenient = (relevant + partly) / 5', 'label'),
                 TextBox(f'E_{tag}_plenient', width=14 * mm, height=5.6 * mm), P('strict = relevant / 5', 'label'), TextBox(f'E_{tag}_pstrict', width=14 * mm, height=5.6 * mm)]],
               [14 * mm, 13 * mm, 11 * mm, 13 * mm, 8 * mm, 13 * mm, 40 * mm, 16 * mm, 24 * mm, 16 * mm], valign='MIDDLE', pad=0.6 * mm)
    return boxed([card_head(tag.upper(), f'Context {tag.upper()}'), head, tab, calc])


def method_e(ctx):
    out = [PageBreak(), Banner('E', 'E', 'Relevance & trust survey', 'same 5 users · 10 min each', 'Do the recommendations deserve trust? Does the person understand what the tool does?'), Spacer(1, 2 * mm)]
    out.append(pairs([[('Participant ID', TextBox('E_pid', height=5.8 * mm)), ('Date', TextBox('E_date', height=5.8 * mm))]]))
    out.append(Spacer(1, 1.5 * mm))
    out.append(P('Part 1 — Precision@5', 'h2'))
    out.append(P('Open two different videos or pages. For each, read the <b>top five</b> articles in Related Reading and give <b>your own judgement</b> of relevance to the page <i>before</i> '
                 'looking at the relevance label. Record the title exactly as shown; never invent or paraphrase. Target: lenient precision ≥ 70 %.', 'small'))
    out.append(Spacer(1, 1.5 * mm))
    out.append(precision_block('a'))
    out.append(Spacer(1, 3 * mm))
    out.append(precision_block('b'))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Part 2 — Trending quality', 'h2'))
    rows = [[P('#', 'label'), P('Thread title (top 5 in “Hot Right Now”)', 'label'), P('Genuinely trending / worth a look?', 'label'), P('Growth label helped?', 'label')]]
    for i in range(1, 6):
        rows.append([P(f'<b>{i}</b>', 'centerb'), TextBox(f'E_t{i}_title', height=6.2 * mm, size=7.6),
                     ChoiceRow('radio', f'E_t{i}_trend', [('yes', 'Yes'), ('unsure', 'Unsure'), ('no', 'No')], size=3 * mm, fsize=7, gap=2.5 * mm),
                     ChoiceRow('radio', f'E_t{i}_growth', [('yes', 'Yes'), ('no', 'No'), ('na', 'No label')], size=3 * mm, fsize=7, gap=2.5 * mm)])
    out.append(tbl(rows, [7 * mm, 85 * mm, 48 * mm, 42 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=0.9 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Part 3 — Understanding and trust (Likert, 1–5)', 'h2'))
    out.append(scale_table('E_likert', LIKERT))
    out.append(Spacer(1, 1.5 * mm))
    out.append(tbl([[P('Mean of items 1–10', 'label'), TextBox('E_likert_mean', width=18 * mm, height=6 * mm), P('Items 1–3 (privacy understanding) mean — target ≥ 4.0', 'label'), TextBox('E_likert_priv', width=18 * mm, height=6 * mm)]],
                   [34 * mm, 24 * mm, 100 * mm, 24 * mm], valign='MIDDLE', pad=0.8 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Part 4 — Net Promoter Score', 'h2'))
    out.append(P('“How likely are you to recommend Rabbit Hole to a friend or colleague?”', 'small'))
    nps_head = [[P(str(i), 'centerb') for i in range(11)]]
    nps_row = [[ChoiceRow('radio', 'E_nps', [(str(i), str(i)) for i in range(11)], spread=True)] + [''] * 10]
    t = tbl(nps_head + nps_row, [16.5 * mm] * 11, HEAD + GRID + [('SPAN', (0, 1), (10, 1))], valign='MIDDLE', pad=0.8 * mm)
    out.append(t)
    out.append(tbl([[P('0 = not at all likely', 'tiny'), P('10 = extremely likely', 'tiny')]], [91 * mm, 91 * mm], [('ALIGN', (1, 0), (1, 0), 'RIGHT')], pad=0.5 * mm))
    out.append(P('Detractors 0–6 · passives 7–8 · promoters 9–10. NPS = % promoters − % detractors. With five users treat it as a conversation starter, not a statistic.', 'tiny'))
    out.append(Spacer(1, 2.5 * mm))
    out.append(P('Part 5 — In their own words', 'h2'))
    for key, q in (('liked', 'What did you like most?'), ('confused', 'What confused or annoyed you?'), ('creepy', 'Did anything feel intrusive, “creepy” or untrustworthy?'),
                   ('missing', 'What is missing?'), ('word', 'Describe Rabbit Hole in three words.')):
        out.append(KeepTogether([P(q, 'label'), TextBox(f'E_open_{key}', height=9.5 * mm, multiline=True, size=7.6), Spacer(1, 1.4 * mm)]))
    return out


# ── Method F ────────────────────────────────────────────────────────────────────
WCAG = [
    ('1.1.1', 'Non-text content', 'Icon-only buttons (settings gear, dashboard, ×, theme) have accessible names; emoji section icons are labelled or hidden from screen readers.'),
    ('1.3.1', 'Info and relationships', 'Tabs, chips, lists and headings expose their structure (tablist/tab, headings, list items) — check with the accessibility tree.'),
    ('1.3.2', 'Meaningful sequence', 'Reading order of the popup and dashboard matches the visual order (screen-reader pass).'),
    ('1.4.1', 'Use of colour', 'Stale / growth / error / selected states are conveyed by text or shape, not colour alone.'),
    ('1.4.3', 'Contrast (minimum)', 'Text ≥ 4.5:1 (3:1 for large text) in dark, light and system themes — measure with DevTools or axe, including secondary and placeholder text.'),
    ('1.4.4', 'Resize text', 'Dashboard and Settings at 200 % browser zoom: no loss of content or function.'),
    ('1.4.10', 'Reflow', 'Dashboard / Settings at 320 CSS px width: no two-dimensional scrolling.'),
    ('1.4.11', 'Non-text contrast', 'Focus rings, toggles, chip outlines and input borders reach 3:1 against their background.'),
    ('1.4.12', 'Text spacing', 'Apply a text-spacing override (line 1.5, paragraph 2×, letter 0.12 em, word 0.16 em): nothing clipped or overlapping.'),
    ('1.4.13', 'Content on hover or focus', 'Tooltips (e.g. relevance explanations) are dismissible, hoverable and persistent.'),
    ('2.1.1', 'Keyboard', 'Everything works without a mouse: tabs, topic chips, search, card buttons, every Settings control, “Delete everything”.'),
    ('2.1.2', 'No keyboard trap', 'Focus can always leave the popup and any dialog (Tab, Shift+Tab, Esc).'),
    ('2.1.4', 'Character key shortcuts', '“/” focuses search only when no text field has focus, and never fires while typing.'),
    ('2.2.2', 'Pause, stop, hide', 'No auto-updating or moving content; loading shimmer stops when finished; reduced-motion preference is honoured.'),
    ('2.4.3', 'Focus order', 'Header → search → tabs → filters → results → footer; no surprising jumps after results load.'),
    ('2.4.6', 'Headings and labels', 'Headings and control labels describe their purpose (“Open Reddit”, not “Open”).'),
    ('2.4.7', 'Focus visible', 'A visible focus indicator on every interactive element, in both themes.'),
    ('2.4.11', 'Focus not obscured (min)', 'A focused card button is never hidden behind the sticky header or footer (new in WCAG 2.2).'),
    ('2.5.8', 'Target size (minimum)', 'Pointer targets ≥ 24 × 24 CSS px or with enough spacing — measure small icon buttons and chips (new in WCAG 2.2).'),
    ('3.1.1', 'Language of page', 'Popup, options and dashboard declare their language.'),
    ('3.2.2', 'On input', 'Changing a filter, toggle or select does not cause an unexpected change of context.'),
    ('3.3.1', 'Error identification', 'Errors are described in text and say which input or action failed.'),
    ('3.3.2', 'Labels or instructions', 'Search and key fields have visible labels or instructions; keys are masked but their state is announced.'),
    ('4.1.2', 'Name, role, value', 'Custom controls expose name, role and state (selected tab, pressed toggle, expanded section).'),
    ('4.1.3', 'Status messages', 'Result counts, “Finding related writing…” and errors are announced without moving focus (live region).'),
]


def method_f(ctx):
    out = [PageBreak(), Banner('F', 'F', 'Accessibility audit — WCAG 2.2 level AA', '1–2 evaluators · 45 min', 'Tools plus manual checks; popup and full dashboard, dark and light themes'), Spacer(1, 2 * mm)]
    out.append(P('Tools and passes completed', 'h3'))
    out.append(ChoiceRow('check', 'F_tools', [('axe', 'axe DevTools'), ('lh', 'Lighthouse accessibility'), ('kbd', 'Keyboard-only pass'), ('sr', 'Screen reader (VoiceOver / NVDA)'),
                                               ('zoom', '200 % zoom'), ('reflow', '320 px reflow'), ('contrast', 'Contrast tool'), ('motion', 'Reduced-motion on'), ('forced', 'Forced colours')]))
    out.append(Spacer(1, 1.5 * mm))
    out.append(pairs([[('Lighthouse a11y score', TextBox('F_lh', height=5.8 * mm)), ('axe: critical / serious', TextBox('F_axe', height=5.8 * mm))],
                      [('Screen reader + browser', TextBox('F_sr', height=5.8 * mm)), ('Themes tested', TextBox('F_themes', height=5.8 * mm, value='dark, light'))]], label_w=34 * mm))
    out.append(Spacer(1, 2 * mm))
    head = [P('SC', 'label'), P('Criterion — what to check in Rabbit Hole', 'label'), P('Pass', 'tinyc'), P('Fail', 'tinyc'), P('N/A', 'tinyc'), P('Evidence / notes', 'label')]
    rows = [head]
    spans = []
    for i, (sc, name, how) in enumerate(WCAG, start=1):
        rows.append([P(f'<b>{sc}</b>', 'cellb'), P(f'<b>{name}.</b> {how}', 'cell'),
                     ChoiceRow('radio', f'F_{sc.replace(".", "_")}', [('pass', 'Pass'), ('fail', 'Fail'), ('na', 'N/A')], spread=True), '', '',
                     TextBox(f'F_{sc.replace(".", "_")}_note', height=9 * mm, multiline=True, size=7.2)])
        spans.append(('SPAN', (2, i), (4, i)))
    out.append(tbl(rows, [11 * mm, 95 * mm, 9 * mm, 9 * mm, 9 * mm, 49 * mm], HEAD + GRID + spans, repeat=1, valign='MIDDLE', pad=1 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(KeepTogether([
        P('Result', 'h3'),
        pairs([[('Failed criteria', TextBox('F_nfail', height=5.8 * mm)), ('Of which critical', TextBox('F_ncrit', height=5.8 * mm, tip='blocks a task for assistive-technology users'))]], label_w=30 * mm),
        Spacer(1, 1.5 * mm), P('Summary and fixes (target: 0 critical failures)', 'label'), TextBox('F_summary', height=16 * mm, multiline=True),
        Spacer(1, 1 * mm), P('This checklist is a structured self-audit, not a conformance certification. WCAG 2.2 AA conformance needs a formal audit with representative users.', 'tiny')]))
    return out


# ── Method G ────────────────────────────────────────────────────────────────────
ERRORS = [
    ('G1', 'Reddit unreachable', 'DevTools → Network → Offline (or block reddit.com), then open Trending.', 'Plain-language cause (“Reddit blocked / could not be reached”), one clear next step (Try again · Open Reddit); cached data, if any, shown and flagged as stale.'),
    ('G2', 'Topic with no threads', 'Pick the narrowest topic chip with few results.', 'Honest empty state that says why and what to try; no filler threads.'),
    ('G3', 'No search results', 'Search for a nonsense string such as “zzxqjw”.', 'Clear “nothing found” message with suggestions; no invented articles; the search can be edited or cleared.'),
    ('G4', 'Page with no usable metadata', 'On a near-empty page press “Use this page”.', 'Explains that nothing could be identified and offers manual search.'),
    ('G5', 'Netflix labels hidden', 'Open a title page, keep controls hidden (idle mouse) and open the popup.', '“We couldn’t automatically identify what you’re watching” + manual search box; never a wrong guess.'),
    ('G6', 'Detection switched off', 'Settings → Privacy → turn detection off for a platform; open that platform.', '“Page detection is off” with Turn on detection; nothing is read from the page.'),
    ('G7', 'Optional permission declined', 'Enable “Include custom-domain newsletters” and deny the browser prompt.', 'The feature stays off, nothing breaks, and the explanation is understandable.'),
    ('G8', 'Invalid search key', 'Settings → API & Integrations: enter an obviously invalid search key.', 'Search falls back to curated feeds; the key is never shown back; the message is understandable.'),
    ('G9', 'Invalid AI key (if used)', 'Enable the AI layer with an invalid key.', 'Falls back to template explanations; no crash; no key echoed.'),
    ('G10', 'Slow network', 'DevTools → Network → Slow 3G; open Related Reading.', 'Skeletons, never a blank screen; the popup stays responsive; closing it cancels requests.'),
    ('G11', 'Cold service worker', 'chrome://extensions → inspect the service worker → stop it, then open the popup.', 'The popup works on first try; no stuck loader.'),
]
PERF = [
    ('P1', 'Popup first paint (skeleton visible) after clicking the icon', '≤ 300 ms'),
    ('P2', 'Trending threads visible, cache warm', '≤ 500 ms'),
    ('P3', 'Trending threads visible, cold network', '≤ 3 s'),
    ('P4', 'Related Reading: first cards visible, cold', '≤ 6 s'),
    ('P5', 'Related Reading: cards visible, cache warm', '≤ 500 ms'),
]


def method_g(ctx):
    out = [PageBreak(), Banner('G', 'G', 'Error-state & performance matrix', '1–2 evaluators · 30 min', 'Do failures read well, and is the interface fast enough to feel instant?'), Spacer(1, 2 * mm)]
    out.append(P('Part 1 — Error states', 'h2'))
    out.append(P('Trigger each state, compare with the expected behaviour, and tick what holds. <b>Cause</b> = the cause is stated in plain words · <b>Next</b> = a next step is offered · <b>Honest</b> = nothing is invented or guessed. Result: <b>P</b>ass, <b>F</b>ail or <b>S</b>kipped (say why).', 'small'))
    head = [P('Scenario and how to trigger', 'label'), P('Expected behaviour', 'label'), P('Cause', 'tinyc'), P('Next', 'tinyc'), P('Honest', 'tinyc'), P('Result', 'tinyc'), P('Observed', 'label')]
    rows, spans = [head], []
    for i, (gid, name, how, expect) in enumerate(ERRORS, start=1):
        rows.append([P(f'<b>{gid} · {name}</b><br/>{how}', 'cell'), P(expect, 'cell'),
                     ChoiceRow('check', f'G_{gid}_chk', [('cause', ''), ('next', ''), ('real', '')], spread=True), '', '',
                     Dropdown(f'G_{gid}_res', ['-', 'P', 'F', 'S'], width=10 * mm), TextBox(f'G_{gid}_obs', height=11 * mm, multiline=True, size=7.2)])
        spans.append(('SPAN', (2, i), (4, i)))
    out.append(tbl(rows, [43 * mm, 43 * mm, 10 * mm, 10 * mm, 10 * mm, 13 * mm, 53 * mm], HEAD + GRID + spans, repeat=1, valign='MIDDLE', pad=0.9 * mm))
    out.append(PageBreak())
    out.append(P('Part 2 — Performance (proposed targets; calibrate on your machine)', 'h2'))
    out.append(P('Measure with DevTools → Performance (inspect the popup) or a 60 fps screen recording, counting frames. Take three runs, quit nothing in between, and record the median. '
                 'Reddit and Substack speed is outside the product’s control: judge P3 and P4 against the network you used.', 'small'))
    head = [P('Metric', 'label'), P('Target', 'label'), P('Run 1', 'tinyc'), P('Run 2', 'tinyc'), P('Run 3', 'tinyc'), P('Median', 'tinyc'), P('Meets?', 'tinyc')]
    rows = [head]
    for pid, name, target in PERF:
        rows.append([P(f'<b>{pid}</b> {name}', 'cell'), P(target, 'cell')] + [TextBox(f'G_{pid}_r{k}', height=5.6 * mm, size=7.6) for k in (1, 2, 3)] +
                    [TextBox(f'G_{pid}_med', height=5.6 * mm, size=7.6), Dropdown(f'G_{pid}_ok', ['-', 'Yes', 'No'], width=13 * mm)])
    rows.append([P('<b>P6</b> Typing a new query while one runs: the old request is cancelled and no stale results flash', 'cell'), P('pass / fail', 'cell'),
                 TextBox('G_P6_obs', height=5.6 * mm, size=7.6), '', '', '', Dropdown('G_P6_ok', ['-', 'Yes', 'No'], width=13 * mm)])
    rows.append([P('<b>P7</b> Popup closed and idle for 60 s: no network or CPU activity apart from the optional background refresh', 'cell'), P('quiet', 'cell'),
                 TextBox('G_P7_obs', height=5.6 * mm, size=7.6), '', '', '', Dropdown('G_P7_ok', ['-', 'Yes', 'No'], width=13 * mm)])
    n = len(rows)
    out.append(tbl(rows, [68 * mm, 20 * mm, 17 * mm, 17 * mm, 17 * mm, 17 * mm, 26 * mm], HEAD + GRID + [('SPAN', (2, n - 2), (5, n - 2)), ('SPAN', (2, n - 1), (5, n - 1))], repeat=1, valign='MIDDLE', pad=0.9 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Measurement conditions', 'h3'))
    out.append(pairs([[('Machine / CPU', TextBox('G_machine', height=5.8 * mm)), ('Network', TextBox('G_network', height=5.8 * mm, tip='e.g. office Wi-Fi, 50 Mbit/s'))],
                      [('Chrome version', TextBox('G_chrome', height=5.8 * mm)), ('Other extensions on', TextBox('G_ext', height=5.8 * mm))]], label_w=30 * mm))
    out.append(Spacer(1, 2 * mm))
    out.append(P('Observations, anomalies, screenshots taken', 'label'))
    out.append(TextBox('G_notes', height=40 * mm, multiline=True))
    out.append(Spacer(1, 2 * mm))
    out.append(P('Summary: biggest risk found in Method G', 'label'))
    out.append(TextBox('G_summary', height=16 * mm, multiline=True))
    return out


# ── Method H ────────────────────────────────────────────────────────────────────
EXPERIMENTS = [
    dict(id='E1', title='Show the basis of a relevance label', hyp='H-1, H-3, H-7',
         hypo='Showing the matched topics on the card, instead of only inside a hidden tooltip, raises understanding and click-through without slowing the first click.',
         a='Control: label (Highly / Very relevant / Related) with the explanation in a tooltip.',
         b='Variant: same label plus a one-line, always-visible basis ("Matches: AI agents, software development").',
         primary='Share of participants who open an article; Likert "I understand why this was recommended" (1-5).',
         guard='Time to first click; error / abandon rate.'),
    dict(id='E2', title='First-run explanation of what is read', hyp='H-2',
         hypo='A one-time, dismissible note about what the extension reads and sends raises privacy understanding without hurting task success.',
         a='Control: no first-run message (privacy found via the footer and Settings).',
         b='Variant: one-time note on first open, "Rabbit Hole reads only the page you have open, when you open it. What it reads", dismissible, never shown again.',
         primary='Likert "I understand what Rabbit Hole reads and sends" (target mean >= 4.0).',
         guard='Dismiss time; T1 completion; whether people read it.'),
    dict(id='E3', title='Which tab opens first on a video page', hyp='H-6',
         hypo='Opening on Related Reading when a video is detected is a better default than opening on Trending, because users came to find related reading.',
         a='Control: Related Reading first when a video is detected.',
         b='Variant: Trending first, with the "Because you are watching" rows pinned at the top.',
         primary='First-click success on T1 and T3; time to first meaningful click.',
         guard='Tab switches before first click; stated surprise.'),
    dict(id='E4', title='Make the Netflix fallback the obvious next step', hyp='H-4',
         hypo='Putting the search box in focus with a short prompt makes people use the fallback sooner than the current message does.',
         a='Control: message plus manual search box below it.',
         b='Variant: message plus focused search box with the prompt "Type the title you are watching" and a primary Search button.',
         primary='Share who start a manual search within 10 s; time to first search.',
         guard='Abandon rate; wrong-title searches.'),
]


def experiment_card(e):
    rows = [
        ('Hypothesis', e['hypo'], 11), ('Variant A', e['a'], 9), ('Variant B', e['b'], 11), ('Primary metric', e['primary'], 9), ('Guardrails', e['guard'], 8),
    ]
    data = [[P(label, 'label'), TextBox(f"H_{e['id']}_{label.replace(' ', '_').lower()}", height=h * mm, multiline=True, value=val, size=7.6)] for label, val, h in rows]
    data.append([P('Design', 'label'), tbl([[P('Participants / variant', 'label'), TextBox(f"H_{e['id']}_n", width=18 * mm, height=5.6 * mm, value='>= 20'),
                                           P('Duration / sessions', 'label'), TextBox(f"H_{e['id']}_dur", width=24 * mm, height=5.6 * mm),
                                           P('Run as', 'label'), ChoiceRow('radio', f"H_{e['id']}_mode", [('mod', 'Moderated'), ('unmod', 'Unmoderated'), ('build', 'Two builds')], size=3 * mm, fsize=7, gap=2 * mm)]],
                                         [28 * mm, 20 * mm, 28 * mm, 26 * mm, 12 * mm, 40 * mm], valign='MIDDLE', pad=0.5 * mm)])
    data.append([P('Decision rule', 'label'), TextBox(f"H_{e['id']}_rule", height=8 * mm, multiline=True, size=7.6, value='Decide before running. Example: ship B if its primary metric beats A by the agreed margin and no guardrail worsens.')])
    data.append([P('Results', 'label'), tbl([[P('A', 'label'), TextBox(f"H_{e['id']}_resA", width=34 * mm, height=5.6 * mm), P('B', 'label'), TextBox(f"H_{e['id']}_resB", width=34 * mm, height=5.6 * mm),
                                          P('Spread / CI', 'label'), TextBox(f"H_{e['id']}_ci", width=34 * mm, height=5.6 * mm)]],
                                        [6 * mm, 36 * mm, 6 * mm, 36 * mm, 18 * mm, 36 * mm], valign='MIDDLE', pad=0.5 * mm)])
    data.append([P('Decision', 'label'), ChoiceRow('radio', f"H_{e['id']}_decision", [('b', 'Ship B'), ('a', 'Keep A'), ('iter', 'Iterate'), ('inc', 'Inconclusive')])])
    t = Table(data, colWidths=[24 * mm, CONTENT_W - 24 * mm])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 1.6 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 1.6 * mm),
                           ('TOPPADDING', (0, 0), (-1, -1), 0.8 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 0.8 * mm), ('LINEBELOW', (0, 0), (-1, -2), 0.3, LINE)]))
    return KeepTogether([boxed([card_head(e['id'], e['title'], f"· tests {e['hyp']}"), t]), Spacer(1, 3 * mm)])


def method_h(ctx):
    out = [PageBreak(), Banner('H', 'H', 'A/B experiment plan', 'product team · 30 min', 'Four design questions, written down before anyone looks at results'), Spacer(1, 2 * mm)]
    out.append(callout(
        '<b>No telemetry — by design.</b> Rabbit Hole collects no analytics, so experiments cannot be measured from usage data. Run them as <b>moderated or unmoderated task studies</b> '
        '(with the metrics below captured by an observer, a screen recording or a survey), or as two builds given to different participants. Pre-register the metric and the decision rule; '
        'about 20 participants per variant lets you spot large differences, not small ones.', color=colors.HexColor('#c98a00'), bg=colors.HexColor('#fffaf0')))
    out.append(Spacer(1, 2.5 * mm))
    out.append(P('The four experiments are pre-filled from the design hypotheses; edit anything. Replace <i>Decision rule</i> with concrete numbers before starting.', 'small'))
    out.append(Spacer(1, 1.5 * mm))
    for e in EXPERIMENTS:
        out.append(experiment_card(e))
    return out


# ── Part 9 ──────────────────────────────────────────────────────────────────────
CRITERIA = [
    ('Task completion, core tasks T1-T5 (Method C)', '>= 80 % unassisted'),
    ('T1 time: open on a video to open a related article (C)', '<= 30 s median'),
    ('SUS (D)', '>= 75'),
    ('Precision@5, lenient (E)', '>= 70 %'),
    ('Heuristic evaluation (A): major (3) or catastrophic (4) problems', '0 unresolved before release'),
    ('Accessibility audit (F): critical failures', '0'),
    ('"I understand what Rabbit Hole reads and sends" (E, items 1-3)', '>= 4.0 mean'),
]


def consolidation(ctx):
    out = [PageBreak(), Banner('I', '9', 'Consolidation & sign-off', 'facilitator · 45 min', 'Merge every evaluator’s findings into one list, then decide'), Spacer(1, 2 * mm)]
    out.append(P('9.1 Merged findings log', 'h2'))
    out.append(P('One row per distinct problem. Merge duplicates, quote the on-screen words, and take severity as the median of the evaluators’ ratings (discuss any gap of two or more points). '
                 'Priority: <b>P1</b> = severity ≥ 3, or found by two or more methods; <b>P2</b> = severity 2; <b>P3</b> = severity 0–1.', 'small'))
    rows = [[P('ID', 'label'), P('Source', 'label'), P('Problem (observation → consequence)', 'label'), P('Methods', 'label'), P('Sev.', 'label'), P('Prio.', 'label'), P('Fix / owner / status', 'label')]]
    for i in range(1, 19):
        rows.append([P(f'<b>{i}</b>', 'centerb'), Dropdown(f'I_f{i}_src', HEUR_CODES, width=14 * mm), TextBox(f'I_f{i}_text', height=9.6 * mm, multiline=True, size=7.4),
                     TextBox(f'I_f{i}_meth', height=9.6 * mm, size=7.4, tip='methods that found it, e.g. A,B,C'), Dropdown(f'I_f{i}_sev', SEV, width=11 * mm),
                     Dropdown(f'I_f{i}_prio', ['-', 'P1', 'P2', 'P3'], width=12 * mm), TextBox(f'I_f{i}_fix', height=9.6 * mm, multiline=True, size=7.4)])
    out.append(tbl(rows, [8 * mm, 17 * mm, 66 * mm, 16 * mm, 14 * mm, 15 * mm, 46 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=0.8 * mm))

    out.append(PageBreak())
    out.append(P('9.2 Heuristic × evaluator severity matrix (Method A)', 'h2'))
    out.append(P('Enter each evaluator’s <b>worst</b> severity for the heuristic (0–4). “Max” shows where the greatest risk lies; “Agree” counts evaluators who rated it ≥ 2.', 'small'))
    from form_front import HEURISTICS
    head = [P('Heuristic', 'label')] + [P(f'E{k}', 'centerb') for k in range(1, 6)] + [P('Max', 'centerb'), P('Agree', 'centerb'), P('# problems', 'centerb')]
    rows = [head]
    for i, (title, *_rest) in enumerate(HEURISTICS, start=1):
        rows.append([P(f'<b>H{i}</b> {title}', 'cell')] + [Dropdown(f'I_m{i}_e{k}', SEV, width=11 * mm) for k in range(1, 6)] +
                    [TextBox(f'I_m{i}_max', height=5.6 * mm, size=7.6), TextBox(f'I_m{i}_agree', height=5.6 * mm, size=7.6), TextBox(f'I_m{i}_n', height=5.6 * mm, size=7.6)])
    out.append(tbl(rows, [60 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 16 * mm, 16 * mm, 20 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=0.9 * mm))
    out.append(pairs([[('Evaluators', TextBox('I_m_names', height=5.8 * mm, tip='E1..E5 names or initials')), ('Overall mean severity', TextBox('I_m_mean', height=5.8 * mm))]], label_w=30 * mm))

    out.append(Spacer(1, 3 * mm))
    out.append(P('9.3 User-test results (Methods C, D, E)', 'h2'))
    out.append(P('Result key: <b>U</b> unassisted · <b>H</b> with hint · <b>F</b> failed. Report counts (“4 of 5”), not percentages, with five users.', 'small'))
    head = [P('', 'label')] + [P(f'T{k}', 'centerb') for k in range(1, 6)] + [P('T1 time (s)', 'centerb'), P('SEQ mean', 'centerb'), P('SUS', 'centerb'), P('P@5', 'centerb'), P('NPS 0–10', 'centerb')]
    rows = [head]
    for p in range(1, 6):
        rows.append([P(f'<b>P{p}</b>', 'centerb')] + [Dropdown(f'I_u_p{p}_t{k}', ['-', 'U', 'H', 'F'], width=11 * mm) for k in range(1, 6)] +
                    [TextBox(f'I_u_p{p}_{c}', height=5.6 * mm, size=7.6) for c in ('t1s', 'seq', 'sus', 'p5', 'nps')])
    rows.append([P('<b>Summary</b>', 'centerb')] + [TextBox(f'I_u_sum_t{k}', height=5.6 * mm, size=7.6, tip=f'T{k} unassisted count') for k in range(1, 6)] +
                [TextBox(f'I_u_sum_{c}', height=5.6 * mm, size=7.6) for c in ('t1s', 'seq', 'sus', 'p5', 'nps')])
    out.append(tbl(rows, [20 * mm, 13 * mm, 13 * mm, 13 * mm, 13 * mm, 13 * mm, 20 * mm, 17 * mm, 17 * mm, 17 * mm, 26 * mm], HEAD + GRID + [('BACKGROUND', (0, 6), (-1, 6), PAPER2)], repeat=1, valign='MIDDLE', pad=0.7 * mm))

    out.append(PageBreak())
    out.append(P('9.4 Against the success criteria', 'h2'))
    rows = [[P('Metric', 'label'), P('Target', 'label'), P('Measured', 'label'), P('Met?', 'label')]]
    for i, (metric, target) in enumerate(CRITERIA, start=1):
        rows.append([P(metric, 'cell'), P(target, 'cell'), TextBox(f'I_c{i}_val', height=5.8 * mm, size=7.8), ChoiceRow('radio', f'I_c{i}_met', [('yes', 'Yes'), ('no', 'No'), ('na', 'n/a')], size=3 * mm, fsize=7, gap=2 * mm)])
    out.append(tbl(rows, [78 * mm, 34 * mm, 30 * mm, 40 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=1 * mm))
    out.append(Spacer(1, 3 * mm))
    out.append(P('9.5 Top findings', 'h2'))
    for i in range(1, 6):
        out.append(labelled(f'Problem {i}', TextBox(f'I_top{i}', height=7.6 * mm, multiline=True, size=7.8), CONTENT_W, 22 * mm))
    for i in range(1, 4):
        out.append(labelled(f'Keep {i}', TextBox(f'I_keep{i}', height=6 * mm, size=7.8), CONTENT_W, 22 * mm))
    out.append(Spacer(1, 2 * mm))
    out.append(P('9.6 Decision', 'h2'))
    out.append(ChoiceRow('radio', 'I_decision', [('ship', 'Ship as is'), ('fix', 'Ship after all P1 items are fixed'), ('hold', 'Hold the release'), ('retest', 'Fix, then re-test')], gap=6 * mm))
    out.append(Spacer(1, 1.5 * mm))
    out.append(P('Rationale and next steps', 'label'))
    out.append(TextBox('I_rationale', height=22 * mm, multiline=True))
    out.append(Spacer(1, 3 * mm))
    out.append(P('Sign-off', 'h3'))
    rows = [[P('Name', 'label'), P('Role', 'label'), P('Date', 'label'), P('Initials / signature', 'label')]]
    for i in range(1, 4):
        rows.append([TextBox(f'I_sign{i}_name', height=6 * mm), TextBox(f'I_sign{i}_role', height=6 * mm), TextBox(f'I_sign{i}_date', height=6 * mm), TextBox(f'I_sign{i}_sig', height=6 * mm)])
    out.append(tbl(rows, [54 * mm, 46 * mm, 32 * mm, 50 * mm], HEAD + GRID, repeat=1, valign='MIDDLE', pad=1 * mm))
    return out


# ── Part 10 ─────────────────────────────────────────────────────────────────────
HYPOTHESES = [
    ('H-1', '“Highly relevant” is not explained — the tooltip that says how it was judged is hidden.', 'T2; the label and the “Why” box on a card.', '≥ 2 of 5 users cannot say what the label is based on; evaluators flag heuristics 6 and 10.', 'A, B, C, E'),
    ('H-2', 'There is no first-run explanation of what the extension reads; privacy clarity depends on finding the footer or Settings.', 'First open; T5; Likert items 1–3.', 'Mean < 4.0 on items 1–3, or users need > 60 s to find Privacy.', 'A, C, E'),
    ('H-3', 'Cards are dense at 480 × 600 and the “Why this is relevant” box is skipped.', 'Card layout; observation during T1–T2.', '≥ 3 of 5 never mention the “Why” box unprompted.', 'A, C'),
    ('H-4', 'Netflix users whose labels are hidden do not notice the fallback search box.', 'T6 on a Netflix title with hidden controls; G5.', 'Users wander or click elsewhere for > 10 s before using the search box.', 'B, C, G'),
    ('H-5', 'Emoji section icons (flame, chart, speech bubble, globe) are ambiguous or noisy for screen-reader users.', 'Topic / section chips with a screen reader; SC 1.1.1, 1.3.1.', 'The screen reader reads emoji names, or the chips’ purpose is unclear.', 'F'),
    ('H-6', 'The automatic tab choice (Related Reading on a video) surprises people who expect Reddit first.', 'The first popup open on a video (T1) and then T3.', '≥ 2 users say they expected Reddit first, or switch tabs immediately.', 'B, C'),
    ('H-7', '“Because you’re watching” rows can show weak matches, hurting trust in the whole tab.', 'Trending tab while a video is detected; Method E part 2.', 'More than 1 in 5 of those rows are judged not relevant.', 'E'),
    ('H-8', 'The Settings page (six sections) is long; users may not find “Delete everything” or the key fields.', 'T5 and T7; Settings → Your data.', 'More than 45 s, or visible hunting, to find the control.', 'B, C'),
]


def facilitator(ctx):
    out = [PageBreak(), Banner('J', '10', 'Facilitator notes', 'do not read before you have finished A and B', 'Hypotheses, analysis guidance and references'), Spacer(1, 2 * mm)]
    out.append(callout('<b>Why this page is last.</b> The design team goes in with eight suspicions. If evaluators see them first, they will look only where the team points and agree with it. '
                       'Reveal this page to evaluators after they have completed Methods A and B independently; a hypothesis that nobody found unprompted is itself a finding.', color=colors.HexColor('#c98a00'), bg=colors.HexColor('#fffaf0')))
    out.append(Spacer(1, 2 * mm))
    rows = [[P('ID', 'label'), P('Hypothesis', 'label'), P('Where to look', 'label'), P('What would confirm it', 'label'), P('Methods', 'label')]]
    for hid, h, where, conf, m in HYPOTHESES:
        rows.append([P(f'<b>{hid}</b>', 'cellb'), P(h, 'cell'), P(where, 'cell'), P(conf, 'cell'), P(m, 'cell')])
    out.append(tbl(rows, [11 * mm, 64 * mm, 40 * mm, 51 * mm, 16 * mm], HEAD + GRID, repeat=1))
    out.append(P('Facts for checking participants’ understanding (Method C debrief, Method E items 1–2)', 'h3'))
    out += bullets([
        '<b>Read:</b> only the page that is open when the user opens the popup, and only on YouTube, Netflix, Reddit and Substack — or on any other site when the user presses “Use this page”.',
        '<b>Stored:</b> settings and any API keys on the device; caches in memory only, cleared when the browser closes; no browsing history.',
        '<b>Sent:</b> short topic queries to Reddit and a search provider; with the optional AI layer, a title, channel and a short description excerpt. No analytics, no tracking.',
    ])
    out.append(P('Analysing the results', 'h3'))
    out += bullets([
        'Individual evaluators find only a minority of problems; the union of three to five finds many more — that is why Method A is run independently and merged (Nielsen &amp; Landauer, 1993).',
        'Write each problem as <b>observation → consequence → heuristic</b>. Quote the interface. Separate the problem from the proposed fix.',
        'Five users are enough to surface most <i>qualitative</i> problems, but not to estimate rates. Report counts, ranges and quotes, not percentages or significance.',
        'Triangulate: a problem seen in A <i>and</i> B <i>and</i> C is far more credible than one seen once. Mark such rows P1 in the findings log.',
        'Typical benchmarks: SUS ≈ 68 average; SEQ ≈ 5.5 average; NPS depends heavily on context — compare with your own earlier rounds rather than with the industry.',
        '<b>Limits of this pack:</b> inspection methods cannot replace users; the form is a template and the extension has not yet been evaluated with it.',
    ])
    out.append(P('References', 'h3'))
    refs = [
        'Nielsen, J. (1994). Heuristic evaluation. In Nielsen &amp; Mack (Eds.), <i>Usability Inspection Methods</i>. Wiley.   ·   Nielsen, J. (1994). <i>10 Usability Heuristics for User Interface Design</i>. nngroup.com.',
        'Nielsen, J. &amp; Molich, R. (1990). Heuristic evaluation of user interfaces. <i>Proc. CHI ’90</i>.   ·   Nielsen, J. &amp; Landauer, T. (1993). A mathematical model of the finding of usability problems. <i>Proc. INTERCHI ’93</i>.',
        'Wharton, C., Rieman, J., Lewis, C. &amp; Polson, P. (1994). The cognitive walkthrough method: a practitioner’s guide. In <i>Usability Inspection Methods</i>.',
        'Brooke, J. (1996). SUS: a “quick and dirty” usability scale. In <i>Usability Evaluation in Industry</i>.   ·   Sauro, J. &amp; Lewis, J. (2016). <i>Quantifying the User Experience</i> (2nd ed.). Morgan Kaufmann.',
        'Sauro, J. &amp; Dumas, J. (2009). Comparison of three one-question, post-task usability questionnaires. <i>Proc. CHI ’09</i>.   ·   Reichheld, F. (2003). The one number you need to grow. <i>Harvard Business Review</i>.',
        'W3C (2023). <i>Web Content Accessibility Guidelines (WCAG) 2.2</i>. w3.org/TR/WCAG22.',
    ]
    out += [P(r, 'small') for r in refs]
    return out
