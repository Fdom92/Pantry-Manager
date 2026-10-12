# Privacy Policy — PantryMind

Last updated: 07/10/2026

PantryMind ("the App") is developed by Fernando del Olmo ("the Developer").
This Privacy Policy explains what data the App handles, when, and why.

## 1. Summary

- **All pantry data stays on your device.** Items, batches, shopping list,
  preferences and history are stored locally and are never sent to any server.
- **No account, no login, no profile.** We do not know who you are.
- **No advertising, no tracking for marketing, no data sale.**
- A few **optional, consent-gated** services are used to keep the App
  working and improving (analytics, crash reporting, in-app purchases,
  AI insights, smart receipt scanning). You can opt out at any time and the
  App remains fully functional.

## 2. What stays on your device

The following data **never leaves your device** unless you explicitly export
or share it yourself (e.g. via the Backup export feature):

- Pantry items, batches and expiration dates
- Shopping list entries
- Categories, supermarkets and locations you create
- App preferences (theme, language, notification settings)
- Local activity history used to power Insights

Uninstalling the App deletes all of this data permanently from the device.

## 3. Optional services that may leave the device

Each of the following services is **off by default** or only activated when
you explicitly perform an action that requires it. You can disable them at
any time from **Settings → Privacidad** or by uninstalling the App.

### 3.1 Anonymous usage analytics (PostHog, EU)

- **What:** Anonymous events (e.g. "app opened", "tab viewed", "item added")
  with technical context (app version, OS version, language). No item
  names, no locations, no personal identifiers, no IP geolocation.
- **Why:** Understand which features are used and where users get stuck,
  to prioritise improvements.
- **Provider:** PostHog Inc., processed in the EU region
  (`eu.posthog.com`). [PostHog Privacy Policy](https://posthog.com/privacy).
- **Consent:** Off by default. You opt in during onboarding or via
  Settings → Privacidad. You can revoke at any time.

### 3.2 Crash and performance reporting (Sentry, EU)

- **What:** Error stack traces, the screen you were on, app version,
  device model and OS. We explicitly disable IP capture and any default
  personally identifiable information.
- **Why:** Detect and fix bugs before they affect more users.
- **Provider:** Functional Software, Inc. dba Sentry, processed in the EU
  region (`de.sentry.io`). [Sentry Privacy Policy](https://sentry.io/privacy/).
- **Consent:** Tied to the same toggle as analytics — off by default,
  opt-in via the same Privacidad setting.

### 3.3 In-app purchases (RevenueCat)

- **What:** Anonymous purchase tokens needed to validate your PRO
  subscription against Google Play. A randomly generated, non-personal
  identifier is created on first launch and stored locally; RevenueCat
  receives it when you initiate or restore a purchase.
- **Why:** Required to deliver PRO features after purchase.
- **Provider:** RevenueCat, Inc. [RevenueCat Privacy Policy](https://www.revenuecat.com/privacy/).
- **Consent:** Only activated when you tap "Upgrade to PRO" or
  "Restore purchases". Free users with PRO disabled send no data here.

### 3.4 AI insights (OpenAI, via our backend)

- **What:** PRO users who tap "Generate insights" send aggregated,
  anonymised consumption statistics (counts, categories, expiry trends)
  to our backend, which forwards them to OpenAI for analysis.
  **No item names, no personal data, no device identifiers** are included
  in the payload.
- **Why:** Powers the AI-generated insights shown in the Insights tab.
- **Provider:** OpenAI L.L.C., via a backend hosted on Render (EU region).
  [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy).
- **Consent:** Only triggered when a PRO user explicitly requests an
  analysis. Free users never reach this code path.
- **PRO check:** The request carries the same anonymous identifier
  described in 3.3 so the backend can confirm your subscription. It is
  not linked to your name or any other personal data.

### 3.6 Smart receipt scanning (OpenAI, via our backend) — PRO

- **What:** When a **PRO** user scans a shopping receipt, the photo is
  read **on your device** (text recognition runs locally; the photo is
  never uploaded and is not kept by the App). The **text lines** read from
  the receipt are then sent to our backend, which forwards them to OpenAI
  to pick out the purchased products and quantities. Because this is the
  full text of the receipt, it can include anything printed on it besides
  the products — for example the store name and address, the date and
  time, and payment or loyalty-card lines. We instruct the model to ignore
  those lines, but they are part of what is transmitted. Only the
  products and quantities come back, and you review and correct them
  before anything is added to your pantry.
- **Why:** Reads garbled or unusual receipt layouts better than the
  on-device parser used by the free tier.
- **Provider:** OpenAI L.L.C., via a backend hosted on Render (EU region).
  [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy).
  The request also carries the anonymous identifier described in 3.3 to
  confirm your PRO subscription.
- **What we keep:** The backend does not store receipt text or photos.
  Server logs keep technical metadata only (the anonymous identifier,
  the number of lines and error messages); if processing fails, a short
  excerpt of the technical response may appear in those logs.
- **Consent:** Used automatically whenever a PRO user scans a receipt
  while online. Free users never reach this code path, and a PRO user
  who is offline or whose request fails falls back to the on-device
  parser, in which case nothing leaves the device.

### 3.5 Local notifications

Notifications are scheduled and shown by your device's operating system.
Nothing is sent to a server to deliver them. The notification permission is
requested with your explicit consent during onboarding and can be revoked
in your device settings at any time.

## 4. Data we never collect

- Real names, email addresses, phone numbers, postal addresses
- Precise location (GPS) or coarse location
- Contacts, calendar, microphone
- Photos and camera images: receipt photos are read on your device and
  never uploaded (only the text read from a receipt is sent, and only for
  PRO smart scanning — see 3.6)
- Advertising identifiers
- Behavioural profiles or marketing segments

## 5. Children's privacy

PantryMind is not directed to children under 13 (or the equivalent
minimum age in your jurisdiction). We do not knowingly collect personal
information from children.

## 6. Your rights

Because the App does not associate data with a personal identifier, we
generally cannot link any record back to you. You can still:

- **Turn off analytics and crash reporting** at any time via
  Settings → Privacidad. Future events stop immediately.
- **Reset all local data** via Settings → Datos → "Delete all data" or
  by uninstalling the App.
- **Contact the Developer** at the email below for any privacy question
  or request.

## 7. Data retention

- **On your device:** until you delete the App or reset its data.
- **PostHog:** subject to PostHog's retention defaults (currently
  7 years for events on the Developer plan, though we use a free tier
  with shorter limits in practice).
- **Sentry:** subject to Sentry's retention defaults
  (currently 30 days on the Developer plan).
- **RevenueCat / OpenAI / Render:** subject to their own policies linked
  in section 3. Our backend does not store the text of AI insight requests
  or receipts (see 3.4 and 3.6).

## 8. Changes to this policy

This Privacy Policy may be updated when the App changes the data it
handles. The current version is always available at:

👉 <https://fdom92.github.io/Pantry-Manager/privacy-policy>

Material changes will be announced via the App's release notes.

## 9. Contact

For questions or requests about this Privacy Policy:

- Email: <fer.olmo92@gmail.com>
- Developer: Fernando del Olmo
