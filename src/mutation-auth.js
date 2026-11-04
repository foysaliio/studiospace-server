import jwt from "jsonwebtoken";
import { fromNodeHeaders } from "better-auth/node";

const cookieName = "studiospace_mutation";
const tokenOptions = {
  algorithm: "HS256",
  issuer: "studiospace-server",
  audience: "studiospace-mutations",
};

export function createMutationAuth(auth) {
  const secret = process.env.MUTATION_JWT_SECRET;

  if (!secret) {
    throw new Error("Set MUTATION_JWT_SECRET in the server .env file.");
  }

  async function getSession(req) {
    return auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
  }

  async function issueCookie(req, res) {
    res.set("Cache-Control", "no-store");

    // This endpoint is called directly from the StudioSpace browser app.
    if (req.get("origin") !== process.env.CLIENT_URL) {
      return res.status(403).json({ message: "Invalid request origin." });
    }

    const session = await getSession(req);

    if (!session?.user || !session.session) {
      return res.status(401).json({ message: "Please log in to continue." });
    }

    const token = jwt.sign({ sid: session.session.id }, secret, {
      ...tokenOptions,
      subject: session.user.id,
      expiresIn: "5m",
    });

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
      maxAge: 5 * 60 * 1000,
    });

    return res.status(204).end();
  }

  async function requireCookie(req, res, next) {
    if (req.get("origin") !== process.env.CLIENT_URL) {
      return res.status(403).json({ message: "Invalid request origin." });
    }

    const token = req.cookies?.[cookieName];

    if (!token) {
      return res.status(401).json({ message: "Please log in to continue." });
    }

    let claims;

    try {
      claims = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: tokenOptions.issuer,
        audience: tokenOptions.audience,
      });
    } catch {
      return res
        .status(401)
        .json({ message: "Your authorization has expired." });
    }

    const session = await getSession(req);

    if (
      !session?.user ||
      !session.session ||
      claims.sub !== session.user.id ||
      claims.sid !== session.session.id
    ) {
      return res.status(401).json({ message: "Please log in to continue." });
    }

    req.authSession = session;
    return next();
  }

  return { issueCookie, requireCookie };
}
