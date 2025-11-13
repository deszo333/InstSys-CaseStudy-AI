import express from "express";
import fs from "fs";
import path from "path";
import { loadStudents } from "../utils/RBAC.js"; // adjust paths
import { fileURLToPath } from "url";

const router = express.Router();
console.log("🔹 Fetch Student route initialized");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __outdirname = path.dirname(__dirname);
const ACCOUNTS_DIR = path.join(__outdirname, "src/config");

// 🔹 GET /student/:student_id
router.get("/:student_id", async (req, res) => {
  try {
    const studentId = req.params.student_id;
    console.log("fetch student route hit with ID:", studentId);

    let students = loadStudents();
    // console.log("All students loaded:", students);

    // Support both array and object shapes
    let student;
    if (Array.isArray(students)) {
      student = students.find(
        (s) => s.studentId === studentId || s.id === studentId || s?.student_id === studentId
      );
    } else if (students && typeof students === "object") {
      // try keyed lookup first, then fallback to find by nested id fields
      student = students[studentId] ?? Object.values(students).find(
        (s) => s?.studentId === studentId || s?.id === studentId || s?.student_id === studentId
      );
    }

    // If still not found and the request is for the guest id, try guest.json
    if (!student && studentId === "PDM-0000-000000") {
      const guestFile = path.join(ACCOUNTS_DIR, "guest.json");
      console.log("🔍 Looking for guest student data in:", guestFile);
      if (fs.existsSync(guestFile)) {
        const guestData = JSON.parse(fs.readFileSync(guestFile));
        student = guestData[studentId] ?? Object.values(guestData)[0];
        console.log("Guest student data loaded:", student);
      }
    }
    
    else if (!student) {
      console.log("❌ Student not found:", studentId);
      return res.status(404).json({ error: "Student not found" });
    }
    console.log("Decrypted student data (raw):", student);

    // Decrypt and split name (guarding against undefined fields)
    const decryptedName = student.studentName;
    const nameParts = (decryptedName || "").split(" ").filter(Boolean);

    let firstName = "", middleName = "", lastName = "";
    if (nameParts.length >= 3) {
      firstName = nameParts[0];
      middleName = nameParts[1];
      lastName = nameParts.slice(2).join(" ");
    } else if (nameParts.length === 2) {
      firstName = nameParts[0];
      lastName = nameParts[1];
    } else {
      firstName = decryptedName;
    }

    const decryptedStudent = {
      studentId,
      firstName,
      middleName,
      lastName,
      email: student.email,
      year: student.year,
      course: student.course,
      role: student.role,
      img: student.image || null, // assuming image is stored directly
      facedescriptor: student.faceDescriptor || null,
    };

    res.status(200).json(decryptedStudent);
    // console.log("Decrypted student data sent:", decryptedStudent);
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.error("Error in fetch student route:", err);
  }
});

export default router;
