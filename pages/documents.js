import { useCallback, useEffect, useState } from "react";
import DocumentCard from "../components/DocumentCard";
import PdfUploader from "../components/PdfUploader";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/documents");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load documents.");
    setDocuments(data.documents || []);
  }, []);

  useEffect(() => {
    loadDocuments().catch((err) => setError(err.message));
  }, [loadDocuments]);

  async function handleUpload(file) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const uploadResponse = await fetch("/api/upload", { method: "POST", body });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadData.error || "Upload failed.");

      setNotice("File uploaded. Extracting text, chunking, and indexing…");
      const ingestResponse = await fetch("/api/documents/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: uploadData.document.id }),
      });
      const ingestData = await ingestResponse.json();
      if (!ingestResponse.ok) throw new Error(ingestData.error || "Processing failed.");

      setNotice(ingestData.message || "Document processed successfully.");
      await loadDocuments();
    } catch (err) {
      setError(err.message);
      await loadDocuments().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(document) {
    if (!window.confirm(`Delete ${document.name}? This cannot be undone.`)) return;
    setDeletingId(document.id);
    setError("");
    try {
      const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed.");
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      <h1>Documents</h1>
      <p className="lede">Upload a PDF or text file, then chat with grounded citations.</p>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <h2>Upload</h2>
        <PdfUploader onUpload={handleUpload} disabled={busy} />
        {busy ? <p role="status">Processing your document…</p> : null}
      </div>

      {notice ? (
        <p className="success-banner" role="status" style={{ marginTop: 16 }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="error-banner" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      ) : null}

      {documents.length === 0 && !busy ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <h2>No documents yet</h2>
          <p>Upload a syllabus, notes, or a report to start document chat.</p>
        </div>
      ) : (
        <div className="doc-grid">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onDelete={handleDelete}
              deleting={deletingId === document.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
