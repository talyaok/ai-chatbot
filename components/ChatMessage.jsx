export default function ChatMessage({
  role = "assistant",
  content,
  mode,
  imageUrl,
  streaming = false,
}) {
  const sender = role === "user" ? "You" : "Aether";
  const modeLabel =
    mode === "rag" ? "Document chat" : mode === "image" ? "Image chat" : "General chat";

  return (
    <article className={`chat-message ${role}`} aria-live={streaming ? "polite" : undefined}>
      <div className="meta">
        {sender}
        {mode ? ` · ${modeLabel}` : ""}
        {streaming ? " · thinking" : ""}
      </div>
      {imageUrl ? <img src={imageUrl} alt="Attached image" style={{ maxWidth: "220px", borderRadius: 12, marginBottom: 8 }} /> : null}
      <div>{content || (streaming ? "Thinking…" : "")}</div>
    </article>
  );
}
