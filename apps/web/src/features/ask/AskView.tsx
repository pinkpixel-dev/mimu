import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Ask } from "@mimu/shared";
import type { ApiClient } from "../../lib/api/client.ts";
import { formatDate } from "../../lib/format.ts";
import { routeHref } from "../../lib/router.ts";
import { EmptyState } from "../library/EmptyState.tsx";
import { Markdown } from "../library/Markdown.tsx";
import searching from "../../assets/mascot/8.webp";
import "./ask.css";

const POLL_MS = 2000;
/** If a question has waited this long, the desktop worker probably isn't running. */
const SLOW_HINT_MS = 25_000;

const isOpen = (ask: Ask) => ask.status === "pending" || ask.status === "answering";

export function AskView({ api }: { api: ApiClient }) {
  const [asks, setAsks] = useState<Ask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAsks(await api.listAsks());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, [api]);

  useEffect(() => void refresh(), [refresh]);

  const waiting = asks.some(isOpen);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  async function submit(event: FormEvent, text = question) {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const ask = await api.createAsk(text.trim());
      setAsks((list) => [ask, ...list.filter((a) => a.id !== ask.id)]);
      setQuestion("");
      setError(null);
    } catch (err) {
      setError(`Couldn't send that: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSending(false);
    }
  }

  const empty = loaded && asks.length === 0;
  const form = (
    <form className={empty ? "ask__form ask__form--empty" : "ask__form"} onSubmit={submit}>
      <label className="ask__field">
        <span className="visually-hidden">Ask about your notes</span>
        <input
          className="field__input"
          value={question}
          maxLength={500}
          placeholder="What was that terminal browser idea?"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <button type="submit" className="button button--primary" disabled={sending || !question.trim()}>
        {sending ? "Asking…" : "Ask"}
      </button>
    </form>
  );
  const errorLine = error && (
    <p className="form-error ask__error" role="alert">
      {error}
    </p>
  );

  // With nothing asked yet, the box sits under the mascot. Once there are answers, it moves above them.
  if (empty) {
    return (
      <div className="ask">
        <EmptyState pose="searching" text="Ask about anything you've saved." />
        {form}
        {errorLine}
      </div>
    );
  }

  return (
    <div className="ask">
      {loaded && form}
      {errorLine}
      <ul className="ask__list" aria-live="polite">
        {asks.map((ask) => (
          <AskCard key={ask.id} ask={ask} onRetry={(event) => submit(event, ask.question)} />
        ))}
      </ul>
    </div>
  );
}

function AskCard({ ask, onRetry }: { ask: Ask; onRetry: (event: FormEvent) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen(ask)) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [ask]);
  const slow = isOpen(ask) && now - new Date(ask.created_at).getTime() > SLOW_HINT_MS;

  return (
    <li className="ask-card">
      <p className="ask-card__question">{ask.question}</p>
      {isOpen(ask) && (
        <div className="ask-card__thinking">
          <img src={searching} alt="" width={40} height={40} />
          {slow ? (
            <span>
              Still waiting. Is the Mimu worker running on your desktop? <a href="#/desktop">Set it up</a>
            </span>
          ) : (
            <span>Mimu is looking through your notes…</span>
          )}
        </div>
      )}
      {ask.status === "answered" && ask.answer && (
        <>
          <Markdown source={ask.answer} />
          {ask.notes.length > 0 && (
            <div className="ask-card__sources">
              <span>From your notes:</span>
              <ul>
                {ask.notes.map((note) => (
                  <li key={note.id}>
                    <a href={routeHref({ view: "note", id: note.id })}>{note.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {ask.status === "failed" && (
        <form className="ask-card__failed" onSubmit={onRetry}>
          <span className="form-error">Mimu couldn't answer that one.</span>
          <button type="submit" className="link-button">
            Ask again
          </button>
        </form>
      )}
      <p className="ask-card__time">{formatDate(ask.created_at)}</p>
    </li>
  );
}
