export default function ChunkSourceList({ sources = [] }) {
  if (!sources.length) return null;

  return (
    <section aria-label="Cited sources">
      <h2 className="muted" style={{ fontSize: "0.9rem", margin: "8px 0" }}>
        Sources
      </h2>
      <ol className="source-list">
        {sources.map((source, index) => (
          <li key={source.id || `${source.documentId}-${source.chunkIndex}-${index}`}>
            <strong>
              Source {index + 1}: {source.documentName || "Document"}
              {Number.isInteger(source.chunkIndex) ? ` · chunk ${source.chunkIndex + 1}` : ""}
            </strong>
            <p>{source.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
