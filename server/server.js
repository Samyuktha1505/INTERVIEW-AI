import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import AWS from "aws-sdk";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

// Suppress AWS SDK warning
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

// Load environment variables
dotenv.config();

const app = express();
const port = 3001;

// ✅ Validate required .env variables
const requiredEnv = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_BUCKET_NAME',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];
requiredEnv.forEach(v => {
  if (!process.env[v]) {
    console.error(`❌ Missing env var: ${v}`);
    process.exit(1);
  }
});


console.log("AWS Config: s3 connected", {
  bucket: process.env.AWS_BUCKET_NAME
});


// ✅ AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  params: { Bucket: process.env.AWS_BUCKET_NAME }
});

// ✅ Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ MySQL pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000
});

// Test the connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error connecting to database:", err);
    if (err.code === 'ETIMEDOUT') {
      console.error("Network timeout - check your database is running and accessible");
    }
  } else {
    console.log("✅ Connected to MySQL database");
    connection.release();
  }
});



// ✅ Multer: in-memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF/DOC/DOCX allowed."), false);
    }
  }
});



const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',').shift() ||
    req.socket?.remoteAddress ||
    null
  );
};


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


// ✅ Updated Basic Info API with S3 Upload
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

try {
const {
  email,
  first_name,
  last_name,
  gender,
  date_of_birth,
  college_name,
  years_of_experience,
  //country_code
} = req.body;

// Validate required fields
if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name /*|| !country_code*/) {
  return res.status(400).json({ success: false, error: "Missing required profile fields." });
}

// Handle S3 Upload if file exists
let resumeUrl = null;
if (req.file) {
  const fileExtension = path.extname(req.file.originalname);
  const s3Key = `users/${email}/resumes/${Date.now()}${fileExtension}`;
  
  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
    Metadata: {
      userEmail: email,
      originalName: req.file.originalname
    }
  };

  const s3Response = await s3.upload(uploadParams).promise();
  resumeUrl = s3Response.Location;
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
 
  email,
];


const [result] = await db.promise().query(sql, values);
if (result.affectedRows === 0) {
  return res.status(404).json({ success: false, message: "User not found or no changes made." });
}
return res.status(200).json({ success: true, message: "✅ Profile updated successfully", resumeUrl: resumeUrl || "No resume uploaded"});
} catch (dbErr) {
console.error("❌ Profile update error:", dbErr);
return res.status(500).json({ success: false, message: "Failed to update profile", error: dbErr.message });
}
});
});


// ✅ New Endpoint: Get Resume Download URL
app.get("/api/resume/:email", async (req, res) => {
try {
const { email } = req.params;

// 1. Get resume URL from database
const [rows] = await db.promise().query(
  "SELECT resume_url FROM User WHERE email = ?", 
  [email]
);

if (!rows[0]?.resume_url) {
  return res.status(404).json({ error: "Resume not found" });
}

// 2. Extract S3 key from URL
const s3Key = rows[0].resume_url.split('.com/')[1];

// 3. Generate pre-signed URL (valid for 1 hour)
const url = s3.getSignedUrl("getObject", {
  Bucket: process.env.AWS_BUCKET_NAME,
  Key: s3Key,
  Expires: 3600 // 1 hour expiration
});

res.json({ url });

} catch (err) {
res.status(500).json({ error: err.message });
}
});

app.listen(port, () => {
console.log(`🚀 Server running on http://localhost:${port}`);
});