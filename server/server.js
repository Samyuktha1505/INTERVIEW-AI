import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcrypt";
// middleware/auth.js

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// MySQL connection
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
const uploadsDir = 'uploads/';

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',').shift() ||
    req.socket?.remoteAddress ||
    null
  );
};
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed!'), false);
    }
  }
});

// Login API
// Updated login endpoint with better practices
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  
  // Get IP and location
  const ip_address = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";
  const location = "Surat, India"; // Consider using a geoIP service for dynamic location

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ 
      success: false,
      message: "Email and password are required"
    });
  }

  try {
    // Single query joining User and HASH tables
    const [results] = await db.promise().query(`
      SELECT u.user_id, h.hash_password 
      FROM User u
      JOIN HASH h ON u.email = h.email
      WHERE u.email = ?
    `, [email]);

    // If no user found
    if (results.length === 0) {
      await db.promise().query(
        "INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) VALUES (?, NOW(), ?, ?, ?)",
        [null, ip_address, "FAILED", location]
      );
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    const { user_id, hash_password } = results[0];
    const isValid = await bcrypt.compare(password, hash_password);

    // Log the attempt regardless of success
    await db.promise().query(
      "INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) VALUES (?, NOW(), ?, ?, ?)",
      [user_id, ip_address, isValid ? "SUCCESS" : "FAILED", location]
    );

    if (!isValid) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Successful login
    res.status(200).json({ 
      success: true, 
      message: "Login successful",
      user_id 
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    
    // Log failed attempt due to server error
    await db.promise().query(
      "INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) VALUES (?, NOW(), ?, ?, ?)",
      [null, ip_address, "FAILED", location]
    ).catch(e => console.error("Failed to log login attempt:", e));
    
    res.status(500).json({ 
      success: false,
      message: "Server error during login",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});
// Signup API
app.post("/api/signup", async (req, res) => {
  const { email, mobile, password, countryCode } = req.body;

  if (!email || !mobile || !password || !countryCode) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userInsertQuery = `
      INSERT INTO User (email, phone, country_code, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
    `;

    db.query(userInsertQuery, [email, mobile, countryCode], (userErr, userResult) => {
      if (userErr) {
        console.error("❌ Error inserting user:", userErr);
        return res.status(500).json({ success: false, error: userErr.message });
      }

      const userId = userResult.insertId;

      const hashInsertQuery = `
        INSERT INTO HASH (user_id, email, hash_password)
        VALUES (?, ?, ?)
      `;

      db.query(hashInsertQuery, [userId, email, hashedPassword], (hashErr, hashResult) => {
        if (hashErr) {
          console.error("❌ Error inserting hash:", hashErr);
          return res.status(500).json({ success: false, error: hashErr.message });
        }

        return res.status(200).json({ success: true, message: "✅ Signup successful", user_id: userId });
      });
    });
  } catch (error) {
    console.error("❌ Hashing error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Basic Info API
app.post("/api/basic-info", (req, res) => {
  upload.single('resume')(req, res, async (err) => {
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
      // country_code,
    } = req.body;

    const resumeUrl = req.file ? req.file.path : null;

    if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name /*|| !country_code*/) {
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
      resumeUrl,
      // country_code,
      email,
    ];

    try {
      const [result] = await db.promise().query(sql, values);
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

// Serve static files
app.use('/uploads', express.static('uploads'));

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});