process.removeAllListeners('warning');
import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import AWS from "aws-sdk";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";

// Suppress AWS maintenance message
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';
dotenv.config();

const app = express();
const port = 3001;

// ✅ Check required .env keys
const requiredEnv = [
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BUCKET_NAME',
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'GOOGLE_CLIENT_ID'
];
requiredEnv.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
});

// ✅ AWS S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  params: { Bucket: process.env.AWS_BUCKET_NAME }
});

// ✅ Middlewares
app.use(cors());
app.use(bodyParser.json());

// ✅ MySQL connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10
});
db.getConnection((err, conn) => {
  if (err) console.error("❌ DB Error:", err);
  else {
    console.log("✅ Connected to MySQL");
    conn.release();
  }
});

// ✅ Multer (for resume)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Invalid file type"), false);
  }
});

// ➤ /api/login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const ip_address = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";
  const location = "Surat, India";

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required" });
  }

  try {
    const [results] = await db.promise().query(`
      SELECT u.user_id, h.hash_password 
      FROM User u JOIN HASH h ON u.email = h.email 
      WHERE u.email = ?`, [email]);

    if (results.length === 0) {
      await db.promise().query(`INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) 
        VALUES (?, NOW(), ?, ?, ?)`, [null, ip_address, "FAILED", location]);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const { user_id, hash_password } = results[0];
    const isValid = await bcrypt.compare(password, hash_password);

    await db.promise().query(`INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) 
      VALUES (?, NOW(), ?, ?, ?)`, [user_id, ip_address, isValid ? "SUCCESS" : "FAILED", location]);

    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    return res.status(200).json({ success: true, message: "Login successful", user_id });

  } catch (err) {
    console.error("❌ Login error:", err);
    await db.promise().query(`INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location) 
      VALUES (?, NOW(), ?, ?, ?)`, [null, ip_address, "FAILED", location]);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// ➤ /api/signup
app.post("/api/signup", async (req, res) => {
  const { email, mobile, password, countryCode } = req.body;
  if (!email || !mobile || !password || !countryCode) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(`INSERT INTO User (email, phone, country_code, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())`, [email, mobile, countryCode], (userErr, userResult) => {
      if (userErr) return res.status(500).json({ success: false, error: userErr.message });

      const userId = userResult.insertId;
      db.query(`INSERT INTO HASH (user_id, email, hash_password)
        VALUES (?, ?, ?)`, [userId, email, hashedPassword], (hashErr) => {
        if (hashErr) return res.status(500).json({ success: false, error: hashErr.message });
        return res.status(200).json({ success: true, message: "Signup successful", user_id: userId });
      });
    });

  } catch (err) {
    console.error("❌ Signup error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ➤ /api/basic-info
app.post("/api/basic-info", (req, res) => {
  upload.single('resume')(req, res, async (err) => {
    if (err) return res.status(err instanceof multer.MulterError ? 400 : 500)
      .json({ success: false, error: err.message });

    try {
      const {
        email, first_name, last_name, gender,
        date_of_birth, college_name, years_of_experience
      } = req.body;

      if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name) {
        return res.status(400).json({ success: false, error: "Missing profile fields." });
      }

      let resumeUrl = null;
      if (req.file) {
        const ext = path.extname(req.file.originalname);
        const key = `users/${email}/resumes/${Date.now()}${ext}`;
        const uploadParams = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          Metadata: { userEmail: email }
        };
        const s3Response = await s3.upload(uploadParams).promise();
        resumeUrl = s3Response.Location;
      }

      const [result] = await db.promise().query(`
        UPDATE User SET first_name = ?, last_name = ?, gender = ?, date_of_birth = ?, 
        college_name = ?, years_of_experience = ?, resume_url = ?, updated_at = NOW()
        WHERE email = ?`, [
        first_name, last_name, gender, date_of_birth,
        college_name, years_of_experience, resumeUrl, email
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({ success: true, message: "Profile updated", resumeUrl: resumeUrl || null });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

// ➤ /api/resume/:email
app.get("/api/resume/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const [rows] = await db.promise().query(`SELECT resume_url FROM User WHERE email = ?`, [email]);
    if (!rows[0]?.resume_url) return res.status(404).json({ error: "Resume not found" });

    const s3Key = rows[0].resume_url.split('.com/')[1];
    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600
    });

    return res.json({ url: signedUrl });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ➤ /api/google-auth-login
const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post('/api/google-auth-login', async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;

    // Check if email exists in User table
    const [rows] = await db.promise().query('SELECT * FROM User WHERE email = ?', [email]);

    if (rows.length > 0) {
      res.json({
        success: true,
        user_id: rows[0].user_id,
        email: rows[0].email,
      });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }

  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Configure email transporter (replace with your SMTP details)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map();

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Forgot password - send OTP
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if email exists in database
    const user = await db.promise().query('SELECT * FROM User WHERE email = ?', [email]);
    
    if (user[0].length === 0) {
      return res.status(404).json({ success: false, message: 'Email doesnt exists,please signup to continue' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // OTP expires in 15 minutes

    // Store OTP temporarily
    otpStore.set(email, { otp, expiresAt });

    // Send email with OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}\nThis OTP will expire in 15 minutes.`,
      html: `<p>Your OTP for password reset is: <strong>${otp}</strong></p><p>This OTP will expire in 15 minutes.</p>`,
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found' });
    }

    if (new Date() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // OTP is valid
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Verify OTP again (in case user took too long)
    const storedData = otpStore.get(email);

    if (!storedData || storedData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await db.promise().query(
      'UPDATE HASH SET hash_password = ? WHERE email = ?',
      [hashedPassword, email]
    );

    // Remove OTP from store
    otpStore.delete(email);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});