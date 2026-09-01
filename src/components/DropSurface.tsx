import { FileImage, Upload } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";

interface DropSurfaceProps {
  title: string;
  help: string;
  action: string;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
  compact?: boolean;
}

export function DropSurface({
  title,
  help,
  action,
  onChoose,
  onFiles,
  children,
  compact,
}: DropSurfaceProps) {
  const [dragging, setDragging] = useState(false);

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  };

  return (
    <div
      className={`drop-surface ${dragging ? "dragging" : ""} ${compact ? "compact" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
    >
      <div className="drop-icon" aria-hidden="true">
        {compact ? <FileImage size={24} /> : <Upload size={34} />}
      </div>
      <div className="drop-copy">
        <strong>{title}</strong>
        <span>{help}</span>
      </div>
      <button type="button" className="button primary" onClick={onChoose}>
        <FileImage aria-hidden="true" size={19} />
        <span>{action}</span>
      </button>
      {children}
    </div>
  );
}
