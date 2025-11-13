import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createStudentAccount } from "../utils/RBAC.js";
import nodemailer from "nodemailer";

const router = express.Router();

console.log(
  "Loaded email credentials:",
  process.env.EMAIL_USER,
  process.env.EMAIL_PASS ? "[hidden]" : "undefined"
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

console.log("Gmail config:", {
  user: process.env.EMAIL_USER,
  hasPass: !!process.env.EMAIL_PASS
});

router.post("/register", async (req, res) => {
  try {
    const parsedData = req.body;

    console.log("Register route hit with data:", parsedData);

    const requiredFields = [
      "studentId",
      "firstName",
      "middleName",
      "lastName",
      "email",
      "year",
      "course",
      "password",
      "faceDescriptor",
      "image", // ✅ new required field
    ];

    const missing = requiredFields.filter((field) => !(field in parsedData));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
    }

    const courseMap = {
      BSCS: "Bachelor of Science in Computer Science (BSCS)",
      BSIT: "Bachelor of Science in Information Technology (BSIT)",
      BSHM: "Bachelor of Science in Hospitality Management (BSHM)",
      BSTM: "Bachelor of Science in Tourism Management (BSTM)",
      BSOAd: "Bachelor of Science in Office Administration (BSOAd)",
      BECEd: "Bachelor of Early Childhood Education (BECEd)",
      BTLEd: "Bachelor of Technology in Livelihood Education (BTLEd)",
    };

    const courseFull = courseMap[parsedData.course] || parsedData.course;

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    console.log("Session object:", req.session);

    // Store registration data and code in session
    req.session.tempUser = {
      ...parsedData,
      course: courseFull,
      verificationCode,
    };

    // Send code to user's email
    await transporter.sendMail({
      from: `"Ai-UI 2FA" <${process.env.EMAIL_USER}>`,
      to: parsedData.email,
      subject: "Your Ai-UI Verification Code",
      text: `Your verification code is: ${verificationCode}`,
    });

    return res.json({ message: "Verification code sent to your email. Please verify.", email: parsedData.email });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Server error during registration" });
  }
});

export default router;
