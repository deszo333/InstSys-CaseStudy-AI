// routes/loginRoute.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { loadStudents, verifyPassword, mapStudentRole } from "../utils/RBAC.js";
import { generateToken } from "../utils/jwtUtils.js";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __outdirname = path.dirname(__dirname);

const ROLE_ASSIGN_FILE = path.join(
  __outdirname,
   "../express-backend/src/config/last_role_assign.json"
);

// ✅ path for writing token
const JWT_TEST_FILE = path.join(
  __outdirname,
  "../express-backend/src/config/test_jwt.json"
);

console.log("🔹 Login route initialized");

// 🔹 POST /login
router.post("/login", async (req, res) => {
  const { studentId, email, password } = req.body;

  // Guest login special case
  if (studentId === "PDM-0000-000000") {
    const guestFile = path.join(__outdirname, "../express-backend/src/config/guest.json");

    try {
      const guestData = JSON.parse(fs.readFileSync(guestFile, "utf-8"));
      const guest = guestData[studentId];
      if (!guest) {
        return res.status(404).json({ error: "Guest account not found" });
      }

      fs.writeFileSync(
        ROLE_ASSIGN_FILE,
        JSON.stringify({ role: "Guest", assign: ["Guest"] }, null, 2),
        "utf-8"
      );

      const token = generateToken({ studentId, role: "Guest" });

      // ✅ Write token to file
      fs.writeFileSync(
        JWT_TEST_FILE,
        JSON.stringify({ studentId, role: "Guest", token }, null, 2),
        "utf-8"
      );

      return res.json({
        message: "Login successful",
        studentId,
        role: "Guest",
        token,
      });
    } catch (err) {
      return res.status(500).json({ error: `Guest login error: ${err.message}` });
    }
  }

  // Load students
  const students = loadStudents();
  if (!students[studentId]) {
    return res.status(404).json({ error: "Student ID not found" });
  }

  // Decrypt and compare email
  const storedEmail = students[studentId].email;
  console.log("Verifying email:", email, "against stored:", storedEmail);
  if (email !== storedEmail) {
    return res.status(401).json({ error: "Email does not match" });
  }

  // Verify password
  const validPassword = verifyPassword(studentId, password);
  if (!validPassword) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  // Determine role
  const studentRole = students[studentId].role;

  //Admin login
  if (studentRole.toLowerCase() === "admin") {
    fs.writeFileSync(
      ROLE_ASSIGN_FILE,
      JSON.stringify({ role: "admin", assign: [""] }, null, 2),
      "utf-8"
    );

    const token = generateToken({ studentId, email, role: "admin" });

    // ✅ Write token to file
    fs.writeFileSync(
      JWT_TEST_FILE,
      JSON.stringify({ studentId, email, role: "admin", token }, null, 2),
      "utf-8"
    );

    return res.json({
      message: "Login successful",
      studentId,
      role: "admin",
      token,
    });
  }

  // Map role + assign
  const { role, assign } = mapStudentRole(studentRole);

  // Save role + assign
  fs.writeFileSync(
    ROLE_ASSIGN_FILE,
    JSON.stringify({ role, assign }, null, 2),
    "utf-8"
  );
  
  const token = generateToken({
    studentId,
    email,
    role: studentRole,
  });

  // ✅ Write token to file
  fs.writeFileSync(
    JWT_TEST_FILE,
    JSON.stringify({ studentId, email, role: studentRole, token }, null, 2),
    "utf-8"
  );

  return res.json({
    message: "Login successful",
    studentId,
    role: studentRole,
    token,
  });
});

export default router;
