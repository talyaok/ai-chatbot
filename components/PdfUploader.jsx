import { useRef } from "react";

export default function PdfUploader({ onUpload, disabled, accept = ".pdf,.txt,.md,.markdown" }) {
  const fileInput = useRef(null);

  return (
    <div>
      <label className="button button-secondary" htmlFor="document-file">
        Choose file
      </label>
      <input
        id="document-file"
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />
      <p className="muted" style={{ marginTop: 8 }}>
        PDF, TXT, or Markdown up to 10MB.
      </p>
    </div>
  );
}
