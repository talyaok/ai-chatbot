import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import ChatWindow from "../../components/ChatWindow";

export default function ChatDocPage() {
  const router = useRouter();
  const { docId } = router.query;
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/documents/${docId}`);
      const data = await response.json();
      if (cancelled) return;
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        setError(data.error || "Could not load this document.");
        return;
      }
      setDocument(data.document);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (notFound) {
    return (
      <div className="page">
        <div className="empty-state">
          <h1>Document not found</h1>
          <p>This document does not exist or you do not have access to it.</p>
          <Link className="button button-primary" href="/documents">
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <p className="error-banner" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="page">
        <p role="status">Loading document…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <ChatWindow documentId={document.id} documentName={document.name} allowImages={false} />
    </div>
  );
}
