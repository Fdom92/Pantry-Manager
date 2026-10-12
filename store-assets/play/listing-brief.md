# PantryMind Play listing brief (release 5.6)

Written 2026-10-12 on `release/5.6` (HEAD `273ad22e`). Inputs: `store-assets/play/manifest.json`, all 30
captures (es and en read in full; de, fr, it, pt spot-checked), the landing pages (`docs/index.html`,
`docs/es/index.html`), the i18n bundles, the receipt scan, restock, insights and upgrade code, the
marketing seeder, and 7 comparable Play listings. Every claim below was checked against the code. Where
something is my judgement and not an observation, it says so.

---

## 1. Summary and top 3 actions

The set looks like the real app: real screens, real copy, no mock-ups. It sells three things well:
"what expires first", the pantry, and the shopping list. It is missing the most distinctive thing in 5.6,
the **receipt review** (free: a photo of the receipt becomes pantry lines, and you set food type and expiry
per line before saving). Comparable apps observed on Play add food by barcode or by typing. None of their
listing copy mentions free receipt review. The current PRO shot (restock) is weak: about 60% of it repeats
slot 1 and nothing in it says PRO.

The data mostly reads as real, with a few tells that give the seeder away. Fix those before the
recapture, because a store visitor notices them before reading any caption.

**Top 3 actions**

1. **Capture slot 2, the receipt review, on your phone. Use one fictional ticket per language** (see §3,
   "Missing captures"). Show it second, right after the dashboard.
2. **Fix 4 seeder tells and recapture 01, 02, 04 and 05.** (a) Product names in Title Case in
   es/fr/it/pt. (b) Mercadona/Lidl as store names in all six languages. (c) Greek yogurt and milk are on
   the shopping list *and* offered as "Add" in the PRO restock card. (d) The number 14 three times on the
   first screen. Details are in §2.
3. **Drop `06-pro-restock` and capture the PRO AI analysis on Insights instead.** That gives one clearly
   labelled PRO shot, 6 slots in total. Six strong shots beat eight padded ones.

---

## 2. Findings per current capture

Resolution 1080×2160 (exactly 2:1, the Play maximum). If you add a caption band in Canva, keep the final
image at 2:1 or less on the long side (9:16 at 1080×1920 is the safe choice).

At Play's thumbnail size (~160 px wide) **no in-app text is readable in any shot**. What reads at that size
is layout and colour: card blocks, the red "expires tomorrow", the green headline. The caption carries
the message, and the screenshot only has to look credible.

### 01-dashboard: KEEP the screen, RECAPTURE after seeder fixes
- **Shows:** a 12-day streak, "Recommended for today: Chicken breast, *expires tomorrow*", plus
  strawberries 1 day and bread 2 days, then "14 products expire in 15 days", "6 products are below
  minimum", the locked PRO "Running out soon" pill, and a card cut off by the tab bar.
- **Proves:** the core promise. The app tells you what to use first. This is the best hook in the set.
- **Problems:**
  - **The number 14 appears three times:** "2 days to go until **14**" (streak milestone), "**14**
    products expire…" and the **14** badge on the Pantry tab. It reads as typed-in data. Move the streak
    to a different milestone distance (e.g. 9 days → "5 days to go until 14") or seed a near-expiry
    count of about 9–11.
  - Title Case product names in es/fr/it/pt ("Pechuga de Pollo", "Blanc de Poulet"). People type
    "Pechuga de pollo". English and German capitalise more, so those are fine.
  - The violet PRO lock pill sits in the free hero shot. It's honest, but it puts PRO into the first
    impression. Either scroll about 120 px so it falls under the caption crop, or accept it. This is a
    developer call, and I lean to accepting it.
  - fr only: "Il reste 2 jours avant 14" is incomplete French (it needs "avant les 14 jours" or
    "avant 14 jours"). It shows on the French hero shot, so fix the value in `fr.json` before the
    recapture. Change the value, not the key.
  - "14 products expire in 15 days" means "within", but it reads as "on day 15". That is app copy, not
    a store problem. Note only.

### 02-pantry: KEEP the screen, RECAPTURE
- **Shows:** search, filter chips (All 42 / No alerts 22 / Low stock 6), the Fresh section with the
  Plenty/Low/Out toggles, then the Pantry section with quantities and "Expires in 4 weeks".
- **Proves:** the whole inventory in one place, and fresh food tracked without dates. That second point
  sets PantryMind apart from the date-based apps observed on Play.
- **Problems:**
  - **es: all four visible fresh items are "Poco" with amber bars** (Aguacates, Brócoli, Espinacas,
    Salmón 2 días). The list is alphabetical, so the first rows depend on language. In es it looks as
    if everything is running out. en and it show a natural mix of Plenty and Low. Seed the
    states so the first 4 alphabetical rows in **each** language mix 2 Plenty, 1 Low and 1 red date.
  - Title Case again ("Aceite de Oliva", "Atún en Lata", "Burro di Arachidi").
  - In 5.6 the Fresh section is collapsed by default (`91083c60`). The expanded state is a real user
    state, so it's fine to show.
  - The chip row is cut at the right edge ("Stock ba…" in it). That is a natural scroll cue, not a defect.

### 03-receipt-review: MISSING, must be captured on a device (see §3)

### 04-shopping: KEEP the screen, RECAPTURE
- **Shows:** the list grouped by store: Lidl (Greek yogurt, Milk), Mercadona (Chicken breast "running
  low", Rice), Any supermarket (Dishwasher tablets, Laundry detergent).
- **Proves:** the list fills itself from what runs low, and it's organised.
- **Problems:**
  - **Mercadona and Lidl in all six languages.** Mercadona is unknown outside Spain, so the de/fr/it/pt/en
    sets visibly come from a Spanish test device. Real chain names in store graphics can also read as an
    implied partnership (judgement, low risk, but zero benefit). The store field is free text. Seed
    generic, per-language names instead (es "Frutería" / "Súper del barrio", en "Farmers market" /
    "Corner shop", and so on), or show the flat view.
  - In 5.6 the **default is the flat view, sorted by urgency** (`0bc9c69c`). The grouped view is a
    real toggle, so either is honest. Decision for you (§8).
  - Greek yogurt and milk are here as restock suggestions, and the same two products appear in 06 as
    "Runs out in 8/10 days — **Add**". See 06.

### 05-insights: KEEP the screen, RECAPTURE (already planned, the headline went from 28 to 20 px)
- **Shows:** Waste this month "No waste this month! 🎯", Coverage "≈ 2 weeks of food · Good", Rotation
  "88% · High rotation", Breakdown Dairy 10 / Carbohydrate 9 / "Low rotation: Dairy".
- **Proves:** the app turns your activity into a few numbers, each with a status colour.
- **Problems:**
  - **"No waste this month" is the waste card's empty state.** It looks aspirational, but it doesn't
    show what the feature measures. With every pill green, a 12-day streak and 88% rotation, the set
    starts to look too perfect, which is exactly the "staged" feeling you want to avoid.
    **Recommendation (judgement):** seed 2 wasted products this month → "2 products expired on you ·
    Normal". That shows the mechanism, keeps the tone positive, and also feeds the PRO breakdown (§3).
    This reverses part of `1ed0093c`, so it's your call (§8).
  - en only: the header says **"Analysis"** but the tab says **"Insights"**. Align the values in
    `en.json` (`insights.title` vs the tab title) and keep the keys.
  - de/it/pt captures are scrolled a few px, so the waste-card title is clipped under the header (the
    manifest notes this). es is also clipped in the file I read. Recapture all six at scroll 0.
  - The rotation copy says "Last 30 days — … this month": the same period stated twice. That's app copy,
    so note only.

### 06-pro-restock: DROP
- **Shows:** the dashboard scrolled down, with "Upcoming shopping: Greek yogurt, runs out in 8 days · Add;
  Milk, 10 days · Add".
- **Problems:**
  - About 60% of the frame repeats slot 1 ("What to do now", the same two cards).
  - **Nothing on screen says PRO.** Only a caption could, and the screen itself is a thin two-row card.
  - **Contradiction:** both products are already on the shopping list (04). The app offers to add
    something that is already there. This is a **real app behaviour, not only a seeder issue**:
    `insights-state.service.ts` `repositionPredictions` filters out *manual* list items only, not
    automatic restock suggestions. Worth a ticket. For the store set it doesn't matter once this shot
    is dropped.

---

## 3. Recommended set (same order in every language)

| Slot | Screen | Single idea | Funnel role | Action |
|---|---|---|---|---|
| 1 | Dashboard (top) | It tells you what to use before it expires | Hook | Keep, recapture after seeder fixes |
| 2 | Receipt review sheet (free, one line expanded) | A receipt photo becomes pantry lines, and you check type and expiry per line | Differentiator | **New capture on device** |
| 3 | Pantry (Fresh expanded + first pantry rows) | Everything you have, at a glance. No account, works offline | Proof + reassurance | Keep, recapture |
| 4 | Shopping list | What runs low lands on the list | Proof | Keep, recapture (store names) |
| 5 | Insights (scroll 0) | See how much you waste and how long your food lasts | Proof / habit | Recapture (font change + waste decision) |
| 6 | Insights, PRO AI analysis section | PRO: AI analysis of your own habits | Upsell (clearly labelled) | **New capture**, replaces 06-pro-restock |

There is 1 PRO shot out of 6, at the end and labelled PRO in the caption. Slots 1–2 hold the core
promise and the 5.6 differentiator. I deliberately did not add undo-purchase (manifest decision of
2026-10-07, which I agree with), streaks on their own, settings, onboarding or the upgrade page. The
upgrade page shows prices and "Save x%", which Play does not allow in listing graphics.

**Why the dashboard and not the receipt in slot 1 (judgement):** "Chicken breast — expires tomorrow"
is understood in one glance by anyone. The receipt sheet needs a second to parse. The receipt is the
better *differentiator* and the dashboard the better *hook*, so the first experiment (§6) swaps them.

### Missing captures and the data state each needs

**Slot 2: receipt review (your phone, debug APK, marketing seed, PRO off)**
- **Free tier on purpose:** the "More accurate with PRO" pill in the header is what free users really
  see. Keep it in the shot. It's honest and doubles as a soft upsell.
- **One fictional ticket per language.** Matched lines show the pantry product's name (localised by the
  seeder), but unmatched lines show the ticket's own text (`displayName()` → `formatReceiptName(rawName)`).
  A Spanish ticket therefore puts Spanish names into the de/fr/it/pt shots. A cheap way to do it: write
  each ticket as plain text (`PRODUCT NAME   1,25` per line, a `TOTAL` / `SUMME` / `TOTALE` /
  `MONTANT` line at the end), show it on a laptop screen or print it, and photograph only the product
  block. Test each language once: the local parser's rules come from Spanish tickets
  (`core/domain/receipt`) and have only partial de/fr/it handling.
- **Aim for about 7 lines in the 85% sheet:** 2 matched pantry items (they show "Will be added to the
  existing product · Dairy · Expires in …"), 1 fresh match ("Will be marked as in stock"), 3 new
  products with an inferred type and expiry, and **one new line expanded** to show the food-type picker
  and the expiry picker (the 5.6 feature). The footer reads "Add 7 products".
- **Story consistency:** buy what the list asked for. Greek yogurt and milk were on the shopping list
  (04), so put them on the ticket. Add new products that are *not* elsewhere in the set (e.g. hummus,
  tortillas, mozzarella), so the eye doesn't see the same names in every shot.
- Keep a low-confidence unchecked line (e.g. a carrier bag) only if the parser produces it naturally.
  Don't stage it.

**Slot 6: PRO AI analysis (needs PRO + backend)**
- The dev-panel PRO toggle only flips the client. The AI call goes to the backend, and `verifyPro`
  skips the check only when `NODE_ENV !== 'production'`. So you need a debug APK pointed at a local or
  dev backend with an OpenAI key, or a real tester PRO entitlement on production.
- Set the app locale per language before generating. The backend writes in the request's locale. Use
  the text the model actually produced and **don't edit it** in Canva: it has to be what a user would
  get.
- Frame: section title "Smart AI analysis" + Patterns + Detected issues + Recommendations. Scroll so
  the PRO section starts under the caption band.
- If you seed 2 wasted products (§2, 05), scroll a little higher in PRO and also show the waste card's
  PRO lines ("Mostly in: Dairy · ↓ Less than last month"). That covers two PRO perks in one shot.
  With zero waste the breakdown has nothing to show.

### Seeder fixes before the recapture (for you or the `store-screenshots` agent; I did not edit anything)
1. Sentence case for product names in es, fr, it, pt.
2. Per-language generic store names instead of Mercadona/Lidl (or use the flat view).
3. Don't let restock-predicted products also be below their minimum. Pick predicted products (e.g.
   coffee, pasta) that are not already list suggestions.
4. Break the 14/14/14 coincidence on the dashboard.
5. Fresh states: mix them in the first 4 alphabetical rows of every language.
6. Optional (your call): 2 wasted products this month, fewer than last month.
7. Recapture without the old safe-area workaround (manifest note of 2026-10-09).

---

## 4. Captions per language

**Budgets:** headline 5–6 words, target ≤ 28 characters, **hard cap 32** (de/pt run long). Sub-line
≤ 8 words, ≤ 40 characters. Counts include spaces. French uses a narrow no-break space before ":" in
slot 6.

**Register:** es/it/de/pt use informal "tú/tu/du/tu", like the app. **fr: the app bundle mixes "tu"
(onboarding) and "vous" (upgrade, receipt errors)**. I used *tu* to match the first screens a user
sees. If you prefer *vous*, swap: "Vérifiez", "Partagez-la", "Voyez ce que vous gaspillez", "Et combien
de jours vous tenez", "Vos réserves d'un coup d'œil" (all still within budget). **pt is pt-PT**
(the bundle says "stock", "talão"). See §8 about Brazil.

### Headlines

| Slot | es | en | de | fr | it | pt |
|---|---|---|---|---|---|---|
| 1 | Úsalo antes de que caduque (26) | Use it before it expires (24) | Aufbrauchen statt wegwerfen (27) | À consommer en priorité (23) | Usalo prima che scada (21) | Consome antes do prazo (22) |
| 2 | Del ticket a tu despensa (24) | From receipt to pantry (22) | Vom Kassenbon in den Vorrat (27) | Du ticket au garde-manger (25) | Dallo scontrino alla dispensa (29) | Do talão para a despensa (24) |
| 3 | Tu despensa de un vistazo (25) | Your pantry at a glance (23) | Dein Vorrat auf einen Blick (27) | Tes réserves d'un coup d'œil (28) | La dispensa a colpo d'occhio (28) | A despensa num relance (22) |
| 4 | Lo que falta, a la lista (24) | Running low? It's on the list (29) | Was ausgeht, kommt auf die Liste (32) | Ce qui manque, sur la liste (27) | Quel che finisce va in lista (28) | O que falta vai à lista (23) |
| 5 | Mira cuánto desperdicias (24) | See how much you waste (22) | Sieh, wie viel du wegwirfst (27) | Vois ce que tu gaspilles (24) | Scopri quanto sprechi (21) | Vê quanto desperdiças (21) |
| 6 | Con PRO: análisis con IA (24) | With PRO: AI analysis (21) | Mit PRO: KI-Analyse (19) | Avec PRO : analyse par IA (25) | Con PRO: analisi con IA (23) | Com PRO: análise com IA (23) |

### Sub-lines (optional; use them on all slots or on none, so the set stays consistent)

| Slot | es | en | de | fr | it | pt |
|---|---|---|---|---|---|---|
| 1 | Cada día, qué consumir primero (30) | See what to eat first, every day (32) | Jeden Tag sehen, was zuerst dran ist (36) | Chaque jour, quoi utiliser d'abord (34) | Ogni giorno, cosa consumare prima (33) | Todos os dias, o que usar primeiro (34) |
| 2 | Revisa tipo y caducidad de cada línea (37) | Check type and expiry on every line (35) | Typ und Ablaufdatum pro Zeile prüfen (36) | Vérifie type et date ligne par ligne (36) | Controlla tipo e scadenza riga per riga (39) | Confirma tipo e validade linha a linha (38) |
| 3 | Sin cuenta. Funciona sin conexión. (34) | No account. Works offline. (26) | Ohne Konto. Funktioniert offline. (33) | Sans compte. Fonctionne hors ligne. (35) | Senza account. Funziona offline. (32) | Sem conta. Funciona sem internet. (33) |
| 4 | Compártela en PDF o texto (25) | Share it as PDF or text (23) | Als PDF oder Text teilen (24) | Partage-la en PDF ou en texte (29) | Condividila in PDF o testo (26) | Partilha-a em PDF ou texto (26) |
| 5 | Y cuántos días aguantas sin comprar (35) | And how long your food will last (32) | Und wie lange dein Vorrat reicht (32) | Et combien de jours tu tiens (28) | E per quanti giorni hai da mangiare (35) | E para quantos dias tens comida (31) |
| 6 | Patrones, problemas y recomendaciones (37) | Patterns, issues and recommendations (36) | Muster, Probleme und Empfehlungen (33) | Tendances, problèmes et conseils (32) | Abitudini, problemi e consigli (30) | Padrões, problemas e recomendações (34) |

Each claim maps to the code: slot 1 → dashboard "Recommended for today"; slot 2 → receipt review with
the per-line type/expiry accordion (free path = on-device OCR + local parser); slot 3 → PouchDB, no
account; slot 4 → automatic suggestions for products below their minimum, plus `shopping-export.service`
PDF/text; slot 5 → waste count and coverage are free (`waste-tracker-card` gates only the breakdown);
slot 6 → `insights.pro.*` (Patterns / Detected issues / Recommendations / This week).

### Placement and treatment (one treatment for all 6)
- **Canvas 1080×1920.** Caption band in the **top ~22%** (≈ 420 px). Below it, the screenshot scaled to
  about 80% width (≈ 864 px), centred, with the radius matching the app's cards, and allowed to bleed off
  the bottom edge. That keeps the informative top of each screen large and leaves the UI uncovered.
  Never put text over the UI itself.
- **Colours from `src/theme/variables.scss`:** band in `--app-theme-primary-deep` **#2A7E70** with white
  text (4.86:1, passes AA). Don't use the brand teal #3A9882 behind white text (3.5:1, passes only for
  large bold text). The light alternative is the app background #F6FAF8 with near-black text
  and the headline's key word in #2A7E70 (4.5:1).
- **PRO slot only:** add a small pill "PRO" in violet **#7C5CFF** with white text (4.35:1, use it bold
  and ≥ 24 px). The app reserves violet for PRO, so it stays exclusive to slot 6.
- Font: Roboto (the app's typeface on Android) bold for the headline, regular for the sub-line. Same
  sizes on every slot, and size them for German slot 4 (32 characters) so it never wraps differently.
- No device frame is needed. If you use one, use a generic Android one, never a Pixel/Samsung-branded
  frame or fake system UI (notifications, dialogs).

---

## 5. Feature graphic, title, short description (optional suggestions)

### Feature graphic (1024×500)
Keep the text in the central safe area: Play can overlay a play button and crops edges on some
surfaces. App icon on the left, one headline on the right, and nothing else.

| Option | es | en |
|---|---|---|
| A (core promise) | Úsalo antes de que caduque | Use it before it expires |
| B (control) | Tu despensa, bajo control | Your pantry, under control |
| C (5.6 differentiator) | Del ticket a tu despensa | From receipt to pantry |

I'd use A to match slot 1. The other languages reuse the slot 1 or slot 2 headlines from §4.

### Title (≤ 30 characters)

| Lang | Suggestion | Chars | Note |
|---|---|---|---|
| es | PantryMind: Despensa y Compra | 29 | "caducidad" doesn't fit; it goes in the short description |
| en | PantryMind: Pantry & Expiry | 27 | |
| de | PantryMind: Vorrat & MHD | 24 | "MHD" is the term Germans actually search |
| fr | PantryMind : Stock anti-gaspi | 29 | "anti-gaspi" is the common French term |
| it | PantryMind: Scadenze e Spesa | 28 | |
| pt | PantryMind: Despensa e Compras | 30 | at the limit |

Observed pattern in comparable listings: "Name: keyword & keyword" ("Smart Pantry: Food & Expiry",
"Your Food - No Waste Inventory"). Note the brand is spelled **PantryMind** in the app
(`strings.xml`) but **Pantrymind** on the landing page. Pick one for the listing.

### Short description (≤ 80 characters)

| Lang | Text | Chars |
|---|---|---|
| es | Controla tu despensa, recibe avisos antes de que caduque y apunta lo que falta. | 79 |
| en | Track your pantry, get alerts before food expires and list what's running low. | 78 |
| de | Behalte deinen Vorrat im Blick, werde vor dem MHD erinnert, plane den Einkauf. | 78 |
| fr | Gère tes réserves, reçois une alerte avant la péremption, note ce qui manque. | 77 |
| it | Tieni d'occhio la dispensa, ricevi avvisi prima della scadenza, fai la spesa. | 77 |
| pt | Controla a despensa, recebe avisos antes de expirar e anota o que falta. | 72 |

### Long description: first-paragraph hooks (es / en; translate the chosen one)
1. **es:** "¿Cuántas veces has tirado algo que ni recordabas tener? PantryMind te dice qué caduca primero,
   apunta en la lista lo que se acaba y llena la despensa a partir de la foto del ticket. Sin cuenta:
   tus datos se quedan en tu móvil."
   **en:** "How often do you throw out food you forgot you had? PantryMind shows what expires first, puts
   what's running low on your list and fills your pantry from a photo of your receipt. No account: your
   data stays on your phone."
2. **es:** "Haz una foto al ticket, revisa cada línea y listo: tipo de alimento y caducidad incluidos. A
   partir de ahí, PantryMind te avisa antes de que algo se ponga malo."
   **en:** "Snap your receipt, check each line, and your pantry is up to date, food type and expiry
   included. From then on, PantryMind warns you before anything goes off."
3. **es:** "Una despensa que se gestiona en segundos: frescos sin fechas, avisos de caducidad, lista de la
   compra y análisis de lo que desperdicias. Todo lo gratuito funciona sin conexión."
   **en:** "A pantry you manage in seconds: fresh food without dates, expiry alerts, a shopping list and a
   look at what you waste. Every free feature works offline."

Note on hook 1 and 3: "your data stays on your phone" and "works offline" are true for the free
features. Somewhere lower in the long description, say that PRO AI features send data to the server and
need a connection (the privacy policy already discloses this, `accb77ae`). Hook 3's "every free feature
works offline" has one nuance; see §7 (receipt OCR model).

---

## 6. Experiments (Play Console → Store listing experiments)

- **Current traffic is small** (the 6 Oct export showed about 20 real users). Expect wide confidence
  intervals: read the results as directional, run one test at a time, and leave each one up for at
  least 2–3 weeks.
- **Run it on the default listing or on es-ES**, wherever most visitors land. Check that in Play
  Console → Store performance first.
- **Test 1, first screenshot:** A = dashboard first (this brief), B = receipt review first. Same
  captions, same order otherwise. This settles hook vs differentiator.
- **Test 2, caption wording on slot 1:** "Use it before it expires" (action) vs "Know what expires
  first" (awareness). Only after test 1 ends.
- **The one metric:** *retained first-time installers* (Play's default experiment metric; it filters
  out install-and-delete). Cross-check in PostHog with `install_source = 'play'`, to exclude your own
  devices (the CPH2493 phone counts as 3 users), and look at day-1 return.
- Don't test the PRO shot's position until there is real paying-user volume. The only PRO purchase
  recorded so far was a tester's, so any result now would be noise.

---

## 7. Claims I deliberately avoided and why

| Avoided | Why |
|---|---|
| "Free" / "Gratis" on images or in the title | Play's metadata policy steers price and promotional terms out of graphics and the title. Free vs PRO is instead made clear by labelling the one PRO slot. "Free" is fine in the long description. |
| "AI" on the receipt slot (2) | The free scan is on-device OCR plus a rule-based parser. AI parsing is the PRO "smart scan". The in-app upgrade copy ("AI receipt scanning: photograph your shopping ticket…") already blurs this, because it reads as if scanning itself were PRO. Consider wording it as "Smarter AI reading of receipts" so the paywall doesn't contradict the free listing. |
| "Works offline" on the receipt slot | The ML Kit text recognition used is the Play Services one (`play-services-mlkit-text-recognition`), whose model is downloaded on demand. The first scan on a fresh phone may need a connection. The offline claim sits on the pantry slot, where it's fully true. The landing's "100% of free features work offline" has the same nuance; `landing-reviewer` should look at it. |
| Supermarket/receipt support claims ("works with any receipt", chain names) | The local parser's rules come from Spanish tickets (Mercadona, Lidl, Dia, Consum, Carrefour…) with only partial de/fr/it totals. A generic "scan any receipt" claim in de/fr/it/pt invites refunds and bad reviews. |
| "Never waste food again", "save €X", "cut waste by N%" | Outcome promises the app can't guarantee, and there is no measured savings data. "See how much you waste" is the honest version. |
| "Predicts what to buy" for free | Restock predictions are PRO. The free dashboard shows only the locked pill. |
| Household sharing / sync | Observed as the standard pitch of comparable apps (Your Food, Bring!), but PantryMind is local-first with no accounts. Only *list sharing as PDF/text* is true, so slot 4 says only that. |
| Barcode scanning | The app has none (grep finds nothing outside the receipt parser). Competitors lead with it, so don't imply parity. |
| Notification mock-ups in Canva | Play forbids mimicking system UI. The 9:00 expiry alert is real, but it can only be described in text (long description), not drawn. |
| Ratings, user counts, "#1", awards, testimonials | None exist, and Play forbids them in graphics. |
| Numbers from the seeded data as claims ("88% rotation", "12-day streak") | They are demo data. Captions describe the feature, never the seeded values. |

**Policy note, outside the brief but triggered by slot 6 (judgement, please verify):** Google Play's
AI-generated content policy expects apps that generate content with AI to let users report or flag
offensive output. The AI analysis has no report action today. Putting it in the screenshots makes it
more visible, so check whether this policy applies before featuring it.

---

## 8. Decisions needed from you

1. **Waste data in the seed:** keep zero waste (aspirational, but it's the empty state), or seed 2 wasted
   products, fewer than last month (realistic, and it unlocks the PRO breakdown in slot 6)? I recommend
   the 2.
2. **Shopping list shot:** grouped view with generic store names, or the 5.6 default flat view sorted by
   urgency?
3. **Slot 1 PRO lock pill:** leave it visible, or crop/scroll it out?
4. **French register:** *tu* (matches onboarding, used in §4) or *vous*? The bundle itself mixes both,
   which is also worth fixing in-app.
5. **Portuguese market:** the bundle is pt-PT. Do you upload the pt set to pt-PT only (Brazil then sees
   the English default), or also adapt a pt-BR listing ("estoque", "nota fiscal", "você")? Brazil is by
   far the larger market. pt-BR copy is not included here.
6. **Slot 6 capture route:** local/dev backend with an OpenAI key, or a tester PRO account on production?
7. **Brand spelling** on the listing: "PantryMind" (app) or "Pantrymind" (landing)?
8. **The restock duplicate** (§2, 06): file a ticket to exclude automatic list suggestions from
   `repositionPredictions`? This one is product behaviour, not a store issue.

---

### Sources (competitor listings, observed 2026-10-12)
- [Smart Pantry: Food & Expiry](https://play.google.com/store/apps/details?id=com.ivanmorgillo.smartpantry) — barcode, pantry/fridge/freezer, expiry reminders
- [Your Food - No Waste Inventory](https://play.google.com/store/apps/details?id=com.HarderuesCompany.YourFood) — inventory + list from what runs low + household sharing (50K+)
- [My Pantry Tracker](https://play.google.com/store/apps/details?id=com.appking.MyPantryTracker) — barcode/UPC database, lists (10K+)
- [Pantry: Food Expiry Tracker](https://play.google.com/store/apps/details?id=com.sideprojects.pantry) — "Eat soon" list, used/wasted
- [Bring! Grocery Shopping List](https://play.google.com/store/apps/details?id=ch.publisheria.bring) — shared shopping list (10M+)
- [Pantryo](https://play.google.com/store/apps/details?id=app.pantryo) — AI recipe import, family lists
- [PantryKeep (App Store)](https://apps.apple.com/us/app/pantrykeep/id6777104608) and [FridgeTrack (App Store)](https://apps.apple.com/app/id6749074023) — receipt import as an AI or paid feature (iOS; from search summaries, not fetched in full)

Only the listing text was observed; I couldn't load the competitors' screenshots. Statements about their
screenshot style are therefore not made.
