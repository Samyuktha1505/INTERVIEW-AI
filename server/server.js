import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser"; // Keep for other JSON requests if any
import multer from "multer"; // Import multer
import path from "path"; // Import path module for file paths
import fs from "fs"; // Import fs module for file system operations

const app = express();
const port = 3001;

app.use(cors());
// Keep bodyParser.json() for routes that expect JSON (like /api/signup if it sends JSON)
// For routes handling file uploads (multipart/form-data), multer will handle the body.
app.use(bodyParser.json());


// ✅ MySQL connection
const db = mysql.createConnection({
  host: "database-1.chyo8yaqkz22.ap-south-1.rds.amazonaws.com",
  user: "adminphuk",
  password: "Priya442001kunalutsav",
  database: "Interviewbot",
  port: 3306,
});

db.connect((err) => {
  if (err) {
    console.error("❌ Error connecting to database:", err);
  } else {
    console.log("✅ Connected to MySQL database");
  }
});

// Configure Multer for file uploads
const uploadsDir = 'uploads/'; // Define the directory for uploads

// Ensure the uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Files will be stored in the 'uploads/' directory
  },
  filename: (req, file, cb) => {
    // Define the filename: originalname + timestamp + extension
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed!'), false);
    }
  }
});


// ✅ Signup API - stores email & phone
app.post("/api/signup", (req, res) => {
  const { email, mobile } = req.body;
  const query = "INSERT INTO User (email, phone, created_at, updated_at) VALUES (?, ?, NOW(), NOW())";

  db.query(query, [email, mobile], (err, result) => {
    if (err) {
      console.error("❌ Insert error:", err);
      return res.status(500).json({ success: false, error: err.message }); // Return error message
    }
    return res.status(200).json({ success: true, message: "✅ User inserted" });
  });
});

// ✅ Basic Info API - updates user profile after signup
// Use upload.single('resume') to handle a single file upload with the field name 'resume'
app.post("/api/basic-info", (req, res) => {
  upload.single('resume')(req, res, async (err) => { // Wrap the multer call to handle errors
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err);
      return res.status(400).json({ success: false, error: "File upload error: " + err.message });
    } else if (err) {
      console.error("Unknown upload error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    console.log("Received for update:", req.body, "File:", req.file);

    const {
      email,
      first_name,
      last_name,
      gender,
      date_of_birth,
      college_name,
      years_of_experience,
    } = req.body;

    // Get the path of the uploaded file. If no file, resumeUrl will be null.
    const resumeUrl = req.file ? req.file.path : null;

    // Basic server-side validation (consider more robust validation library for production)
    if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name) {
      // If resume is optional, don't include it in this check
      // If it's mandatory, uncomment the resumeUrl check:
      // || !resumeUrl
      return res.status(400).json({ success: false, error: "Missing required profile fields." });
    }

    const sql = `
      UPDATE User SET
        first_name = ?,
        last_name = ?,
        gender = ?,
        date_of_birth = ?,
        college_name = ?,
        years_of_experience = ?,
        resume_url = ?,
        updated_at = NOW()
      WHERE email = ?
    `;

    const values = [
      first_name,
      last_name,
      gender,
      date_of_birth,
      college_name,
      years_of_experience,
      resumeUrl, // Use the path of the uploaded resume
      email,
    ];

    try {
      const [result] = await db.promise().query(sql, values); // Use promise-based query
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "User not found or no changes made." });
      }
      return res.status(200).json({ success: true, message: "✅ Profile updated successfully" });
    } catch (dbErr) {
      console.error("❌ Profile update error:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to update profile", error: dbErr.message });
    }
  });
});

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static('uploads'));

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});