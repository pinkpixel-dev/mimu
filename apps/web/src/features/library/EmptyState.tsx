import waving from "../../assets/mascot/1.webp";
import holding from "../../assets/mascot/2.webp";
import carrying from "../../assets/mascot/3.webp";
import searching from "../../assets/mascot/8.webp";

const POSES = { waving, holding, carrying, searching } as const;

export function EmptyState({ pose, text }: { pose: keyof typeof POSES; text: string }) {
  return (
    <div className="empty">
      <img className="empty__mascot" src={POSES[pose]} alt="" width={112} height={112} />
      <p className="empty__text">{text}</p>
    </div>
  );
}
