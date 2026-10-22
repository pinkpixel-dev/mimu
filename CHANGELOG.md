# Changelog

## 0.1.0 - Unreleased

The first version of Mimu, built for the Hacktoberfest 2026 Week 3 challenge.

### 🎙️ Capture

- Tap the mic and talk. Whisper (`whisper-tiny.en`) transcribes in the browser, and the audio never leaves the device.
- Fix the transcript before saving, or skip the mic with **Type instead**.
- Captures save to an on-device queue first and sync when there's a connection, with a small badge while anything is waiting.
- The mic button turns red with a stop icon while recording.
- WASM is the default speech runtime on every device. WebGPU is opt-in with `?runtime=webgpu`.

### 🧠 Organizing with Gemma

- The desktop worker turns raw transcripts into a title, a cleaned-up Markdown note, a summary, a category, and tags with Gemma 4 (`gemma4:e4b`) through Ollama.
- Suggested categories get matched to existing ones, so near-duplicates like "Developer Tool" and "Developer Tools" don't pile up.
- A separate Gemma pass flags phrases that look misheard. They show up as "Mimu wasn't sure about" instead of being quietly rewritten.
- Notes get organized at startup, every hour, and when you tap **Organize now** (checked every 10 seconds).
- After **Organize now**, the library checks every few seconds for a minute, so notes switch to organized right after Gemma finishes.
- Until a desktop worker has connected, the capture screen shows a short "Set it up" link to the Desktop page.

### ⏰ Due dates, digest, and reminders

- Gemma works out when a note says something is happening ("call the dentist thursday at 2", "the first", "in two weeks"), using the capture time and the phone's timezone. Notes show a badge like "Fri, Oct 23, 10:00 AM", and exports include `due:`.
- Every morning at 8 (desktop time, `MIMU_DIGEST_HOUR`), the worker has Gemma write a short digest of what's due today and what you saved yesterday, and shows it as a desktop notification.
- A **Today** card at the top of the library shows the digest and everything due today.
- Turn on notifications from the Account page to get the morning digest on your phone, plus a reminder 30 minutes before anything with a time. Reminders come from a Cloudflare cron, so they arrive even when your computer is off. On iPhone this needs Mimu added to the Home Screen.
- Due dates and the digest need `@pinkpixel/mimu-worker` 0.2.0 or newer. Older workers still organize notes, they just skip both.

### 📚 Library and Ask

- Full-text search with prefix matching and stemming, plus filters by category, tag, and Unsorted.
- Edit any note by hand. Your edits are never overwritten.
- **Ask Mimu** answers plain-language questions from your notes only, with links to the notes it used. If nothing matches, it says so.
- Export one note as Markdown, or the whole library as a ZIP grouped into category folders, with YAML frontmatter and a `manifest.json`.

### 🖥️ Setup

- `pnpm quickstart` sets up the database, generates an access key, builds the app, and deploys it to Cloudflare in one command.
- The desktop worker is on npm as `@pinkpixel/mimu-worker`. `mimu-worker setup` saves your connection, pulls the model, and starts the worker at login (systemd on Linux, launchd on macOS).
- The **Desktop** page shows the setup command with your URL and key filled in, plus whether your worker is connected.
- `apps/api/.dev.vars.example` lists every setting.
- `pnpm --filter @mimu/api vapid` generates the keys for push notifications.
- `pnpm migrate` also migrates the accounts database and every demo account's database on a hosted demo.

### 🌐 Hosted demo

- Anyone can try Mimu at mimu.pinkpixel.dev without a Turso or Cloudflare account. **Start a demo** creates an account with its own database and a few sample notes.
- Sign in with GitHub, or link GitHub to a demo account later.
- The **Account** page has a QR code that signs your phone in to the same account, plus sign out and delete.
- Demo accounts are deleted after 30 days without use, and sign-ups stop at 50 accounts.
- `pnpm --filter @mimu/api hosted-setup` sets up a hosted demo of your own.
- New demo accounts start with sample notes due today and tomorrow, in the visitor's own timezone.

### 🐛 Fixes

- On iPhones with a notch or Dynamic Island, the top of each screen (the Mimu header, search box, and Ask box) no longer sits under the camera.
- Signing out or deleting a demo account clears captures still waiting to upload on that device, so they can't land in the next account that signs in there.
- The worker explains an HTML response as a missing `/api` at the end of `MIMU_API_URL`.
