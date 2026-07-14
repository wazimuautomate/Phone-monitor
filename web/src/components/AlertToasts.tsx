import type { Alert } from "../lib/alerts";
import { IconClose } from "../lib/icons";

interface AlertToastsProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

export function AlertToasts({ alerts, onDismiss }: AlertToastsProps) {
  if (alerts.length === 0) return null;
  return (
    <div className="toasts">
      {alerts.map((a) => (
        <div key={a.id} className={`toast ${a.severity}`}>
          <div className="toast-body">
            <strong>{a.title}</strong>
            <span>{a.detail}</span>
          </div>
          <button className="icon-btn tiny" onClick={() => onDismiss(a.id)} title="Dismiss">
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
