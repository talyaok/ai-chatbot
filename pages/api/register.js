import prisma, { assertDatabase } from "../../lib/db";
import { hashPassword } from "../../lib/authOptions";
import { applySafeCors, clientKey, rateLimit } from "../../lib/http";
import { AppError, sendJsonError } from "../../lib/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  applySafeCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    rateLimit(`register:${clientKey(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
    await assertDatabase();

    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");

    if (!EMAIL_PATTERN.test(email)) {
      throw new AppError("Enter a valid email address.", { status: 400, code: "INVALID_EMAIL" });
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters.", {
        status: 400,
        code: "WEAK_PASSWORD",
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("An account with that email already exists.", {
        status: 409,
        code: "EMAIL_TAKEN",
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash: await hashPassword(password),
      },
      select: { id: true, email: true, name: true },
    });

    return res.status(201).json({ user });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
