import { nextAuthHandler } from "../../../lib/authOptions";

export default function handler(req, res) {
  if (req.query.newAuth && !req.query.nextauth) {
    req.query.nextauth = req.query.newAuth;
  }
  return nextAuthHandler(req, res);
}
