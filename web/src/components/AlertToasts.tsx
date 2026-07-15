import type { Alert } from "../lib/alerts";
import { IconClose } from "../lib/icons";

export function AlertToasts({ alerts, onDismiss }: { alerts: Alert[]; onDismiss: (id: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="toasts">
      {alerts.map((a) => (
        <div key={a.id} className={`toast ${a.severity}`}>
          <div className="toast-body">
            <strong>{a.title}</strong>
            <span>{a.detail}</span>
          </div>
          <button className="copy-btn" onClick={() => onDismiss(a.id)} aria-label="Dismiss">
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
