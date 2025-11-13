import jwt from "jsonwebtoken";

// Secret should be in .env, fallback for dev
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";

// Generates a JWT for the given payload
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}
