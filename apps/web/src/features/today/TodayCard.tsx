import { useEffect, useState } from "react";
import type { Digest, Note } from "@mimu/shared";
import type { ApiClient } from "../../lib/api/client.ts";
import { fallbackTitle, formatDue, todayKey } from "../../lib/format.ts";
import { routeHref } from "../../lib/router.ts";
import "./today.css";

interface Props {
  api: ApiClient;
  /** Changes whenever notes may have been organized, so newly found due dates show up. */
  refreshKey: number;
}

/** This morning's digest from the desktop worker, plus anything due today. Hidden when there's neither. */
export function TodayCard({ api, refreshKey }: Props) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [due, setDue] = useState<Note[]>([]);

  useEffect(() => {
    let cancelled = false;
    const today = todayKey();
    void Promise.all([api.latestDigest(), api.notesDueOn(today)])
      .then(([latest, dueToday]) => {
        if (cancelled) return;
        setDigest(latest?.date === today ? latest : null);
        setDue(dueToday);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, refreshKey]);

  if (!digest && due.length === 0) return null;

  return (
    <section className="today" aria-labelledby="today-title">
      <h2 className="today__title" id="today-title">
        Today
      </h2>
      {digest && <p className="today__digest">{digest.summary}</p>}
      {due.length > 0 && (
        <ul className="today__list">
          {due.map((note) => (
            <li key={note.id}>
              <a className="today__item" href={routeHref({ view: "note", id: note.id })}>
                <span className="today__time">{note.due_time ? formatDue(note.due_date!, note.due_time).replace(/^Today, /, "") : "Today"}</span>
                <span className="today__name">{note.title ?? fallbackTitle(note.raw_text)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
