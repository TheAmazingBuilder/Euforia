# Surface brief — COSMOZ app shell + all routes

Scope: the whole authenticated app (11 routes, shell, shared primitives).
Mode: **Operate**. Audience, job, constraints: see PRODUCT.md.

## Direction contract — "LE REGISTRE" (the regulated record)

THESIS: COSMOZ is not a neon cockpit; it is the trader's official record —
every trade an entry, every entry auditable, every breach stamped. It refuses
the category default: dark SaaS cards with glow, sparkline wallpaper and
pill-chip noise. Emphasis comes from ink, ruling and stamps — not from hue.

OWN-WORLD: ink-black canvas (three expressions: Encre / Carbone / Papier),
hairline ruling instead of card soup, one disciplined cobalt accent for
interaction only, semantic inks (emerald profit, carmine loss, ochre warning)
used sparingly like stamp pads. Grotesk with press heritage (Schibsted
Grotesk) for display, Inter for text, JetBrains Mono for data — tabular
figures everywhere numbers are compared. Radius system drops to 8px. No glow,
no gradient text, no glass, no colored left-edge bars.

STORY: "This is my book of record." The trader reads exact entries, sees
discipline before P&L, signs off grades, trusts the ledger over the memory.

FIRST VIEWPORT (dashboard): a single ruled stat strip spanning the full
width — five cells divided by hairlines (Net P&L, Win rate, Profit factor,
Expectancy, Discipline), mono tabular numerals, one spark inside the P&L
cell only; below it the equity trajectory drawn on graph paper ruling; the
day's risk budget and coach insights as ruled side column sections. Primary
action: "+ New trade" stays in the sidebar; ledger reference numbers give
the page its archival voice.

SIGNATURE INTERACTION: content settles like paper laid on a desk — one
authored entrance per page (fade + 8px rise, 30–50ms stagger, exponential
ease-out); presses compress 0.98; outcomes carry rubber-stamp marks
(bordered uppercase mono, ±2° rotation) for WIN / LOSS / BREACH moments.

FORM: replacement visual world, chosen from the record-keeping/print family
(7 candidates derived; terminal-neon, cockpit, dossier, broadsheet, phosphor
CRT and incumbent-adjacent studio declined). Seed key: manual roll (script
unavailable) — assigned direction topped the list on both axes (audience
identification: a trader's day is records and blotters; product clarity: a
ledger is literally what the journal is).

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance.
