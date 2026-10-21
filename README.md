<p align="center">
  <img src="assets/icon.png" alt="Mimu" width="128" height="128" />
</p>

# Mimu

**Mimu remembers for you.**

Mimu is a voice notes app for people with too many ideas and not enough patience for note-taking. You tap the mic on your phone, say whatever's on your mind, and it's saved. Later, a model running on your own computer turns those rambling transcripts into tidy Markdown notes with a title, a category, and tags. You can search them, edit them, and export the whole library as plain Markdown whenever you want.

The speech recognition runs on your phone, and the organizing runs on your desktop. No paid AI API is involved anywhere.

## How it works

```text
 Phone                               Cloudflare                     Your desktop
 ┌──────────────────────┐           ┌──────────────────┐           ┌──────────────────────┐
 │ Tap mic → Whisper    │  note     │ Worker           │  claim    │ Mimu worker (Node)   │
 │ (in the browser)     ├──────────►│  /     the app   │◄──────────┤  Gemma 4 via Ollama  │
 │ Review → Save        │           │  /api  the API   │  results  │  organizes notes     │
 └──────────────────────┘           └────────┬─────────┘──────────►└──────────────────────┘
                                             │
                                     Turso (libSQL + FTS5)
```

1. **Capture.** Whisper (`whisper-tiny.en`) runs right in the browser through Transformers.js, so your audio never leaves the phone. You can fix the transcript before saving, or skip the mic and type.
2. **Save.** The note goes into a queue on your device first, then uploads. If you're offline, it waits and syncs when you're back.
3. **Organize.** The Mimu worker on your desktop picks up new notes when it starts, every hour, and whenever you tap **Organize now**. Gemma 4 (`gemma4:e4b` by default) writes a title, a cleaned-up Markdown body, a summary, a category, and tags. Your original transcript is always kept.
4. **Browse.** Search across everything, filter by category, tag, or Unsorted, and edit anything by hand. Your edits are never overwritten by the worker.
5. **Ask.** Ask things like "who do I need to call?" or "what did I save yesterday?". The desktop worker searches your notes and answers from them only, with links to the notes it used.
6. **Export.** Download one note as `.md`, or the whole library as a ZIP of Markdown files grouped into category folders.

## Features

- One-tap voice capture with on-device transcription, plus a "Type instead" option
- Offline capture queue with a small sync badge when something's waiting
- Automatic titles, Markdown cleanup, categories, and tags from a local model
- Categories stay tidy: "Developer Tool" gets filed into an existing "Developer Tools" instead of creating a near-duplicate
- **"Mimu wasn't sure about"**: phrases that look misheard (like "the token cinnamons after an hour") get flagged next to the note instead of being quietly guessed at
- Full-text search with prefix matching and stemming
- **Ask Mimu**: plain-language questions about your notes, answered by your local model from your notes only. If nothing matches, it says so instead of making something up.
- Manual editing, delete with confirmation, and the original transcript one tap away
- Markdown export with YAML frontmatter, stable note IDs, and a `manifest.json`, which also works in Obsidian
- Add to Home Screen on iOS for a full-screen app with the Mimu icon
- Works on phones and desktops: Capture, Library, and Ask tabs on the phone, sidebar plus list and detail panes on a bigger screen

## What you need

- **Node.js 22+** and **pnpm 11**
- **[Ollama](https://ollama.com)** on the computer that will organize your notes. A GPU helps a lot. I use an RTX 4090 laptop GPU, where a note takes about 4 seconds.
- A free **[Cloudflare](https://cloudflare.com)** account (the app and API run on one Worker)
- A free **[Turso](https://turso.tech)** account (the database)

Mimu is single-user. You deploy your own copy, and one access key protects it.

## Setup

### 1. Install

```bash
git clone https://github.com/pinkpixel-dev/mimu.git
cd mimu
pnpm install
```

### 2. Create the database

Create a database in the [Turso dashboard](https://app.turso.tech) and copy its URL (it starts with `libsql://`) and an auth token.

### 3. Add your secrets

Create `apps/api/.dev.vars`. The file name starts with a dot, and that matters: the dotted name is the one that's gitignored.

```bash
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
MIMU_ACCESS_KEY=pick-a-long-random-string
```

You can generate an access key with:

```bash
openssl rand -hex 32
```

### 4. Set up the database tables

```bash
pnpm migrate
```

### 5. Deploy to Cloudflare

Log in to Wrangler if you haven't yet, then add the same three values as Worker secrets:

```bash
cd apps/api
pnpm exec wrangler login
pnpm exec wrangler secret put TURSO_DATABASE_URL
pnpm exec wrangler secret put TURSO_AUTH_TOKEN
pnpm exec wrangler secret put MIMU_ACCESS_KEY
cd ../..
```

Then build and deploy the app and API together:

```bash
pnpm --filter @mimu/api run deploy
```

The `run` part is needed, because `pnpm deploy` is one of pnpm's own commands. Wrangler prints your URL when it's done, something like `https://mimu-api.<you>.workers.dev`. You can also attach a custom domain in the Cloudflare dashboard.

### 6. Start the desktop worker

Pull the model:

```bash
ollama pull gemma4:e4b
```

Copy the example config and fill it in:

```bash
cp apps/worker/.env.example apps/worker/.env
```

```bash
MIMU_API_URL=https://mimu-api.<you>.workers.dev/api
MIMU_ACCESS_KEY=the-same-key-as-before
```

Make sure the URL ends in `/api`. Then start the worker and leave it running:

```bash
pnpm worker
```

The `.env` file also has optional settings for the Ollama host, the model, how often it runs (`MIMU_INTERVAL_MINUTES`, default 60), how often it checks for **Organize now** (`MIMU_POLL_SECONDS`, default 10), and how often it checks for new questions (`MIMU_ASK_POLL_SECONDS`, default 3).

## Using Mimu

1. Open your Worker URL on your phone. The API URL is filled in for you, so paste your access key and tap **Connect**.
2. On iPhone, tap **Share → Add to Home Screen** to get the Mimu icon and full-screen mode.
3. Tap the mic, talk, and tap again. Fix anything that came out wrong, then **Save**.
4. Your note shows up in **Library → Unsorted** as "Waiting for Mimu" until the desktop worker organizes it. Tap **Organize now** if you don't want to wait for the hourly run.
5. Open a note to read it, check the original transcript, **Edit** it, or **Export** it. **Export all** in the library downloads everything.
6. Open **Ask** and ask about anything you've saved. Answers usually take a few seconds and link to the notes they came from. Your desktop worker needs to be running for this.

The first time you open the capture screen, it downloads the Whisper model (about 41 MB). After that, it's cached.

## Privacy

- **Audio stays on your phone.** It's transcribed in the browser and then thrown away. Only the text gets uploaded.
- **Your notes live in your own Turso database**, behind your own Worker and access key.
- **The organizing runs on your own machine** through Ollama. Note text never goes to an AI provider.
- The browser downloads the Whisper model files from Hugging Face and the ONNX Runtime files from jsDelivr. Neither one sees your audio or notes.

## Export format

**Export all** gives you a ZIP like this:

```text
mimu-export/
├── Project-Ideas/
│   └── duplicate-file-analyzer.md
├── Tasks/
│   └── call-mom-about-thanksgiving-plans.md
├── Unsorted/
│   └── pick-up-more-coffee-filters.md
└── manifest.json
```

Each file has YAML frontmatter (`id`, `title`, `created`, `updated`, `category`, `tags`, `status`, plus `uncertain` and `edited` when they apply), then the organized note, then the original transcript as a quote. Notes Mimu hasn't organized yet go in `Unsorted/` as the raw capture. Exports are built straight from your saved notes, so they don't need the desktop or the model.

## Troubleshooting

**The worker says "Expected JSON… Does MIMU_API_URL end in /api?"**
Add `/api` to the end of `MIMU_API_URL`. Every other path on the Worker serves the web app, so the worker gets HTML back.

**The iPhone page reloads right after "Getting ready" hits 100%.**
That's iOS killing the tab, which happened with WebGPU on my iPhone. Mimu uses WASM by default for this reason. If you've added `?runtime=webgpu` to the URL, remove it. Open **Speech runtime** at the bottom of the capture screen to see which backend is in use.

**Notes stay "Waiting for Mimu".**
Make sure `pnpm worker` is running, that Ollama is running, and that the model is pulled (`ollama list`). The worker logs every note it organizes.

**Ask Mimu says "Still waiting. Is the Mimu worker running on your desktop?"**
Questions sit in a queue until the worker picks them up. Start `pnpm worker`, and the waiting question gets answered within a few seconds.

**"Key rejected · Reconnect" shows up in the app.**
The access key changed. Tap it and enter the new one. Anything you saved is still queued on the device.

## Development

Run the API locally against a throwaway database file, so testing never touches your real notes:

```bash
pnpm --filter @mimu/api dev:local
```

That serves the API at `http://127.0.0.1:8788` using `apps/api/local.db` and the access key from `.dev.vars`. In another terminal, start the web app:

```bash
pnpm dev:web
```

Open `http://localhost:5173` and connect to `http://127.0.0.1:8788`. To organize local notes, point the worker at it:

```bash
MIMU_API_URL=http://127.0.0.1:8788 pnpm worker
```

Tests and type checks:

```bash
pnpm test
pnpm typecheck
```

Two small scripts compare models and prompts on sample transcripts:

```bash
pnpm --filter @mimu/worker spike:gemma gemma4:e4b gemma4:12b
pnpm --filter @mimu/worker spike:uncertain gemma4:e4b
```

### Project layout

```text
apps/
  web/      React + Vite app: capture, library, export, connect screen
  api/      Hono API on Cloudflare Workers; also serves the built web app
  worker/   Node worker that organizes notes with Gemma through Ollama
packages/
  shared/   Schemas, slug helpers, and the Markdown export format
assets/     Mascot and app icon
```

## Limitations

- Single user, protected by one access key. There are no accounts.
- English only for now (`whisper-tiny.en`).
- Notes only get organized, and questions only get answered, while your desktop worker is running.
- Ask Mimu finds notes by keyword (with some help from Gemma picking search words), not by meaning, so a question worded very differently from the note can miss it.
- The app itself needs a connection to load. Captures still queue offline once it's open.

## License

[Apache 2.0](LICENSE)

---

Made with 💖 by [Pink Pixel](https://pinkpixel.dev)
