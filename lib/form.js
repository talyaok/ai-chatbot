import formidable from "formidable";

export function parseForm(req, { maxFileSize } = {}) {
  const form = formidable({
    multiples: false,
    maxFileSize: maxFileSize || 10 * 1024 * 1024,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ fields, files });
    });
  });
}

export function firstFile(files, name = "file") {
  const value = files?.[name];
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export function firstField(fields, name) {
  const value = fields?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}
