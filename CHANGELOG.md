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

### 🌐 Hosted demo

- Anyone can try Mimu at mimu.pinkpixel.dev without a Turso or Cloudflare account. **Start a demo** creates an account with its own database and a few sample notes.
- Sign in with GitHub, or link GitHub to a demo account later.
- The **Account** page has a QR code that signs your phone in to the same account, plus sign out and delete.
- Demo accounts are deleted after 30 days without use, and sign-ups stop at 50 accounts.
- `pnpm --filter @mimu/api hosted-setup` sets up a hosted demo of your own.

### 🐛 Fixes

- The Speech runtime panel no longer stretches to fill the capture screen on wide displays.
- Signing out or deleting a demo account clears captures still waiting to upload on that device, so they can't land in the next account that signs in there.
- The worker explains an HTML response as a missing `/api` at the end of `MIMU_API_URL`.
