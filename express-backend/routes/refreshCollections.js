import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const router = express.Router();
console.log("🔹 refresh collections route initialized");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __outdirname = path.dirname(__dirname);

const ROLE_ASSIGN_FILE = path.join(
  __outdirname,
  "/src/config/last_role_assign.json"
);

// console.log("ROLE_ASSIGN_FILE path:", ROLE_ASSIGN_FILE);

// Global-like variables (you can store these elsewhere if needed)
let collections = {};

router.post("/refresh_collections", async (req, res) => {
  collections = {}; // clear previous collections
  let role, assign

  try {
    const data = fs.readFileSync(ROLE_ASSIGN_FILE, "utf-8");
    const lastRoleAssign = JSON.parse(data);

    role = lastRoleAssign.role || "Admin";
    assign = lastRoleAssign.assign || ["BSCS"];

  } catch (err) {
    role = "Admin";
    assign = ["BSCS"];
  }

  // If last login was guest, set role and assign to Guest
  if (role === "Guest") {
    assign = ["Guest"];
  }

  console.log(`Role: ${role}`);
  console.log(`Assign: ${assign}`);

  try {
    await axios.post("http://localhost:5001/v1/chat/prompt/collection", {
      role: role,
      assign: assign
    });
    console.log("✅ Role and assign sent to Python backend");
  } catch (error) {
    console.error("❌ Failed to send role and assign to Python backend:", error.message);
  }

  res.status(200).json({
    message: "Collections refreshed successfully",
    role,
    assign,
  });
});

export default router;
