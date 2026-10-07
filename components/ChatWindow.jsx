import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import ChatMessage from "./ChatMessage";
import ChunkSourceList from "./ChunkSourceList";

function parseSseBuffer(buffer, onEvent) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";
  for (const part of parts) {
    const line = part.split("\n").find((item) => item.startsWith("data: "));
    if (!line) continue;
    try {
      onEvent(JSON.parse(line.slice(6)));
    } catch {
      // ignore incomplete JSON frames
    }
  }
  return rest;
}

export default function ChatWindow({
  documentId = null,
  documentName = null,
  allowImages = true,
}) {
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const shouldStickRef = useRef(true);
  const router = useRouter();

  const mode = image ? "image" : documentId ? "rag" : "general";
  const modeLabel = mode === "rag" ? "Document chat" : mode === "image" ? "Image chat" : "General chat";

  const loadConversations = useCallback(async () => {
    const query = documentId ? `?documentId=${encodeURIComponent(documentId)}` : "";
    const response = await fetch(`/api/conversations${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load conversations.");
    setConversations(data.conversations || []);
    return data.conversations || [];
  }, [documentId]);

  const loadConversation = useCallback(async (id) => {
    if (!id) {
      setMessages([]);
      setConversationId(null);
      return;
    }
    const response = await fetch(`/api/conversations/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load conversation.");
    setConversationId(id);
    setMessages(
      (data.conversation.messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        mode: message.metadata?.mode,
        sources: message.metadata?.sources || [],
      }))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await loadConversations();
        if (!cancelled && items[0]?.id) {
          await loadConversation(items[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [loadConversation, loadConversations]);

  useEffect(() => {
    const node = listRef.current;
    if (!node || !shouldStickRef.current) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  function onScroll() {
    const node = listRef.current;
    if (!node) return;
    shouldStickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }

  async function startNewConversation() {
    abortRef.current?.abort();
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not create a conversation.");
      return;
    }
    setConversationId(data.conversation.id);
    setMessages([]);
    setError("");
    await loadConversations();
  }

  function onPickImage(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Use a JPEG, PNG, WEBP, or GIF image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image is too large. Maximum size is 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.split(",")[1];
      setImage({
        name: file.name,
        mediaType: file.type,
        data,
        preview: result,
      });
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function onPickFile(file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      if (file.size > 10 * 1024 * 1024) {
        setError("PDF is too large. Maximum size is 10MB.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not upload PDF.");
        }
        const id = data.document?.id;
        if (!id) {
          throw new Error("Could not upload PDF.");
        }
        router.push(`/chat/${id}`);
      } catch (err) {
        setError(err.message || "Could not upload PDF.");
      } finally {
        setLoading(false);
      }
      return;
    }
    onPickImage(file);
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text && !image) return;
    if (loading) return;

    setError("");
    setLoading(true);
    setStreaming(false);
    shouldStickRef.current = true;

    const localId = `local-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: localId,
        role: "user",
        content: text || "Please analyze this image.",
        mode,
        imageUrl: image?.preview,
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        mode,
        streaming: true,
        sources: [],
      },
    ]);
    setInput("");
    const imagePayload = image;
    setImage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text || "Please analyze this image.",
          conversationId,
          documentId,
          image: imagePayload
            ? { mediaType: imagePayload.mediaType, data: imagePayload.data }
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Chat request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedText = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseBuffer(buffer, (eventData) => {
          if (eventData.conversationId) {
            setConversationId(eventData.conversationId);
          }
          if (eventData.sources) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, sources: eventData.sources } : message
              )
            );
          }
          if (eventData.error) {
            setError(eventData.error);
          }
          if (eventData.text) {
            receivedText = true;
            setStreaming(true);
            setLoading(false);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content || ""}${eventData.text}`, streaming: true }
                  : message
              )
            );
          }
        });
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, streaming: false } : message
        )
      );
      if (!receivedText) {
        setLoading(false);
      }
      await loadConversations();
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Generation was cancelled.");
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, content: message.content || "Cancelled." }
              : message
          )
        );
      } else {
        setError(err.message || "Chat failed.");
        setMessages((current) => current.filter((message) => message.id !== assistantId));
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="chat-shell">
      <aside className="sidebar" aria-label="Conversations">
        <button type="button" className="button button-primary" onClick={startNewConversation}>
          New chat
        </button>
        <div className="conversation-list">
          {conversations.length === 0 ? <p className="muted">No saved chats yet.</p> : null}
          {conversations.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`conversation-item ${item.id === conversationId ? "active" : ""}`}
              onClick={() => loadConversation(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-panel">
        <div className="chat-header">
          <div>
            <h1 style={{ margin: 0, fontSize: "1.2rem" }}>{documentName || "Aether Chat"}</h1>
            <span className="mode-badge">{modeLabel}</span>
          </div>
        </div>

        <div className="messages" ref={listRef} onScroll={onScroll} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h2>Start a conversation</h2>
              <p>
                {documentId
                  ? "Ask a question about this document. Answers will cite retrieved passages."
                  : "Ask anything, attach an image, or open a document for grounded Q&A."}
              </p>
            </div>
          ) : null}
          {messages.map((message) => (
            <div key={message.id}>
              <ChatMessage
                role={message.role}
                content={message.content}
                mode={message.mode}
                imageUrl={message.imageUrl}
                streaming={message.streaming && !message.content}
              />
              {message.role === "assistant" ? <ChunkSourceList sources={message.sources} /> : null}
            </div>
          ))}
          {loading && !streaming ? (
            <div className="chat-message assistant" role="status">
              Thinking…
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="error-banner" role="alert" style={{ margin: "0 16px 8px" }}>
            {error}
          </div>
        ) : null}

        <form className="composer" onSubmit={sendMessage}>
          {image ? (
            <div className="preview">
              <img src={image.preview} alt={`Preview of ${image.name}`} />
              <button type="button" className="button button-secondary" onClick={() => setImage(null)}>
                Remove image
              </button>
            </div>
          ) : null}
          <div className="composer-row">
            <label className="visually-hidden" htmlFor="chat-input">
              Message
            </label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={documentId ? "Ask about this document…" : "Message Aether…"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {allowImages && !documentId ? (
              <label className="button button-secondary">
                Attach
                <input
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf"
                  disabled={loading}
                  onChange={(event) => onPickFile(event.target.files?.[0])}
                />
              </label>
            ) : null}
            {loading || streaming ? (
              <button type="button" className="button button-secondary" onClick={cancel}>
                Cancel
              </button>
            ) : (
              <button type="submit" className="button button-primary" disabled={!input.trim() && !image}>
                Send
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
