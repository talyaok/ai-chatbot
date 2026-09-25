import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="description" content="Aether Chat — a streaming RAG chatbot with document Q&A and image understanding." />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
