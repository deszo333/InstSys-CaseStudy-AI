import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import multer from "multer";
import nodemailer from "nodemailer";

import loginRoute from "./routes/loginRoute.js";
import fetchStudentRoute from "./routes/fetchStudentRoute.js";
import registerRoute from "./routes/registerRoute.js";
import refreshCollections from "./routes/refreshCollections.js";
import coursesRoute from "./routes/coursesRoute.js";
import fileRoute from "./routes/fileRoute.js";
import twoFactorVerificationRoute from "./routes/twoFactorVerificationRoute.js";
import { connection, upload } from "./src/modules/modules.connection.js";
import { callPythonAPI, configPythonAPI, requestmode } from "./API/PythonAPI.js";
import Filemeta from "./src/utils/cons.js";

console.log("✅ registerRoute.js env check:", {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS ? "[hidden]" : "undefined"
});


const app = express();
const memoryUpload = multer({ storage: multer.memoryStorage() });

console.log("server is starting...");

const PORT = process.env.PORT || 5000;
const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
configPythonAPI();

// ✅ Enable CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ✅ Add session middleware here — BEFORE your routes
app.use(
  session({
    secret: "superSecretKey123!", // 🧠 change this to a strong random string
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // true only for HTTPS
      sameSite: "lax", // change to "none" if using HTTPS and cross-origin
    },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Express server is running" });
  console.log("Health check endpoint was called.");
});

app.use(express.json({ limit: "10mb" }));
app.use("/", loginRoute);
app.use("/student", fetchStudentRoute);
app.use("/", refreshCollections);
app.use("/", registerRoute);
app.use("/", coursesRoute);
app.use("/", fileRoute);
app.use("/", twoFactorVerificationRoute); // <-- Add this line
app.use("v1/request/mode", requestmode); // 

// ✅ File upload endpoint
app.post("/v1/upload/file", memoryUpload.single("file"), async (req, res) => {
  try {
    await connection();

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded (use field name 'file')" });
    }

    const { originalname, buffer } = req.file;
    const ext = path.extname(originalname).toLowerCase();

    const fileType =
      typeof Filemeta.getFileType === "function"
        ? Filemeta.getFileType(ext)
        : new Filemeta().getFileType(ext);

    const allowed = [".xlsx", ".xls", ".pdf"];
    if (!allowed.includes(ext)) {
      return res.status(415).json({ error: "Unsupported file type" });
    }

    const category = String(req.body?.category || "unknown");
    const overwrite = req.body?.overwrite === "true";

    const filePayload = {
      file_name: originalname,
      fileType,
      file: buffer,
      file_category: category,
      overwrite,
    };

    const saved = await upload(filePayload);

    if (!saved) return res.status(500).json({ success: false, error: "Upload failed" });
    if (saved.status === 409) return res.status(409).json(saved);

    return res.status(201).json({ success: true, file: saved });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to upload file" });
  }
});

app.post("/v1/chat/toggle", async (req, res) => {

});

app.post("/v1/chat/prompt", async (req, res) => {
  try {
    const { query } = req.body;
    console.log("Received request to /v1/chat/prompt with query:", query);

    if (!query) {
      return res.status(400).json({ error: "Missing query parameter" });
    }
    const response = await callPythonAPI(query);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data from Python API" });
  }
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
//   tls: {
//     rejectUnauthorized: false,
//   }
// });

// transporter.verify()
//   .then(() => console.log("✅ Gmail ready!"))
//   .catch(err => console.error("❌ Gmail failed:", err));

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
