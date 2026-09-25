import { applySafeCors } from "../../lib/http";

export default async function handler(req, res) {
  applySafeCors(req, res);
  res.status(200).json({
    ok: true,
    service: "finlatics-smart-chatbot",
    time: new Date().toISOString(),
  });
}
