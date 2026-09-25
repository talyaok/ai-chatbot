import Link from "next/link";

const STATUS_LABELS = {
  uploaded: "Uploaded",
  processing: "Processing",
  processed: "Ready",
  failed: "Failed",
};

export default function DocumentCard({
  document,
  onDelete,
  deleting = false,
}) {
  const status = document.status || "uploaded";

  return (
    <article className="doc-card">
      <div className={`status-pill status-${status}`}>{STATUS_LABELS[status] || status}</div>
      <h3>{document.name}</h3>
      <p>
        {document.originalName} · {document.fileType?.toUpperCase()} ·{" "}
        {Math.max(1, Math.round((document.sizeBytes || 0) / 1024))} KB
      </p>
      {status === "processed" ? <p>{document.chunkCount} chunks indexed</p> : null}
      {document.errorMessage ? <p className="error-banner">{document.errorMessage}</p> : null}
      <div className="doc-actions">
        <Link
          className="button button-primary"
          href={`/chat/${document.id}`}
          aria-disabled={status !== "processed"}
          onClick={(event) => {
            if (status !== "processed") event.preventDefault();
          }}
        >
          Open chat
        </Link>
        <button type="button" className="button button-secondary" onClick={() => onDelete(document)} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}
