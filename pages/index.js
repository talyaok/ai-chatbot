import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="muted">Finlatics Web Development · Project 3</p>
          <h1>Aether Chat, a grounded AI assistant for documents, images, and everyday questions.</h1>
          <p className="lede">
            Stream answers in real time, keep conversation memory, upload PDFs, and cite the passages
            that informed each document reply.
          </p>
          <div className="cta-row">
            <Link className="button button-primary" href="/chat">
              Start chatting
            </Link>
            <Link className="button button-secondary" href="/documents">
              Documents
            </Link>
          </div>
        </div>
        <aside className="hero-card" aria-label="Product highlights">
          <p className="muted">What you can do</p>
          <h2 style={{ marginTop: 8 }}>One chatbot, three modes</h2>
          <p>General chat, document Q&A with citations, and image questions — without switching products.</p>
        </aside>
      </section>

      <section className="feature-grid" aria-label="Capabilities">
        <article>
          <h2>Streaming replies</h2>
          <p>Server-sent events show tokens as they arrive, with cancel and thinking states.</p>
        </article>
        <article>
          <h2>Conversation memory</h2>
          <p>Recent turns are stored in PostgreSQL and sent back to Claude for continuity.</p>
        </article>
        <article>
          <h2>RAG with citations</h2>
          <p>PDFs and text files are chunked, embedded, and retrieved from Chroma before answering.</p>
        </article>
        <article>
          <h2>Image understanding</h2>
          <p>Attach a JPEG, PNG, WEBP, or GIF and ask Claude about what is in the picture.</p>
        </article>
      </section>
    </div>
  );
}
