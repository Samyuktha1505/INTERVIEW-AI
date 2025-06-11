import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser"; // Keep for other JSON requests if any
import multer from "multer"; // Import multer
import path from "path"; // Import path module for file paths
import fs from "fs"; // Import fs module for file system operations
import AWS from "aws-sdk";
import dotenv from "dotenv";
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

// Load environment variables
dotenv.config();


const app = express();
const port = 3002;



// Verify environment variables
const requiredEnvVars = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_BUCKET_NAME'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

console.log("AWS Config:", {
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_BUCKET_NAME
});

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  Bucket: process.env.AWS_BUCKET_NAME
});


app.use(cors());
// Keep bodyParser.json() for routes that expect JSON (like /api/signup if it sends JSON)
// For routes handling file uploads (multipart/form-data), multer will handle the body.
app.use(bodyParser.json());

// ✅ MySQL connection
const db = mysql.createPool({
  host: "database-1.chyo8yaqkz22.ap-south-1.rds.amazonaws.com",
  user: "adminphuk",
  password: "Priya442001kunalutsav",
  database: "Interviewbot",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000 // 10 seconds timeout
});


// db.connect((err) => {
//   if (err) {
//     console.error("❌ Error connecting to database:", err);
//   } else {
//     console.log("✅ Connected to MySQL database");
//   }
// });

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

// // Configure Multer for file uploads
// const uploadsDir = 'uploads/'; // Define the directory for uploads

// // Ensure the uploads directory exists
// if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir);
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir); // Files will be stored in the 'uploads/' directory
//   },
//   filename: (req, file, cb) => {
//     // Define the filename: originalname + timestamp + extension
//     cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
//   }
// });

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
//   fileFilter: (req, file, cb) => {
//     const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
//     if (allowedMimes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed!'), false);
//     }
//   }
// });

// Configure Multer for in-memory file handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF/DOC/DOCX allowed!'), false);
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

// // ✅ Basic Info API - updates user profile after signup
// // Use upload.single('resume') to handle a single file upload with the field name 'resume'
// app.post("/api/basic-info", (req, res) => {
//   upload.single('resume')(req, res, async (err) => { // Wrap the multer call to handle errors
//     if (err instanceof multer.MulterError) {
//       console.error("Multer error:", err);
//       return res.status(400).json({ success: false, error: "File upload error: " + err.message });
//     } else if (err) {
//       console.error("Unknown upload error:", err);
//       return res.status(500).json({ success: false, error: err.message });
//     }

//     console.log("Received for update:", req.body, "File:", req.file);

//     const {
//       email,
//       first_name,
//       last_name,
//       gender,
//       date_of_birth,
//       college_name,
//       years_of_experience,
//       country_code, // ✨ NEW: Destructure country_code from req.body
//     } = req.body;

// ✅ Updated Basic Info API with S3 Upload
app.post("/api/basic-info", upload.single('resume'), async (req, res) => {
  try {
    const {
      email,
      first_name,
      last_name,
      gender,
      date_of_birth,
      college_name,
      years_of_experience,
      country_code
    } = req.body;

    // Validate required fields
    if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name || !country_code) {
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

    // // Get the path of the uploaded file. If no file, resumeUrl will be null.
    // const resumeUrl = req.file ? req.file.path : null;

    // // Basic server-side validation (consider more robust validation library for production)
    // if (!email || !first_name || !last_name || !gender || !date_of_birth || !college_name || !country_code) {
    //   return res.status(400).json({ success: false, error: "Missing required profile fields." });
    // }


    const sql = `
    UPDATE User SET
      first_name = ?,
      last_name = ?,
      gender = ?,
      date_of_birth = ?,
      college_name = ?,
      years_of_experience = ?,
      resume_url = ?,
      country_code = ?, -- ✨ NEW: Add country_code to the UPDATE statement
      updated_at = NOW()
    WHERE email = ?
  `;

  const [result] = await db.promise().query(sql, [
    first_name,
    last_name,
    gender,
    date_of_birth,
    college_name,
    years_of_experience,
    resumeUrl,
    country_code, // ✨ NEW: Add country_code to the values array
    email,
  ]);

  res.status(200).json({ 
    success: true, 
    message: "✅ Profile updated successfully",
    resumeUrl: resumeUrl || "No resume uploaded"
  });

} catch (err) {
  console.error("❌ Error:", err);
  res.status(500).json({ 
    success: false, 
    error: err.message 
  });
}
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

//     const sql = `
//       UPDATE User SET
//         first_name = ?,
//         last_name = ?,
//         gender = ?,
//         date_of_birth = ?,
//         college_name = ?,
//         years_of_experience = ?,
//         resume_url = ?,
//         country_code = ?, -- ✨ NEW: Add country_code to the UPDATE statement
//         updated_at = NOW()
//       WHERE email = ?
//     `;

//     const values = [
//       first_name,
//       last_name,
//       gender,
//       date_of_birth,
//       college_name,
//       years_of_experience,
//       resumeUrl,
//       country_code, // ✨ NEW: Add country_code to the values array
//       email,
//     ];

//     try {
//       const [result] = await db.promise().query(sql, values); // Use promise-based query
//       if (result.affectedRows === 0) {
//         return res.status(404).json({ success: false, message: "User not found or no changes made." });
//       }
//       return res.status(200).json({ success: true, message: "✅ Profile updated successfully" });
//     } catch (dbErr) {
//       console.error("❌ Profile update error:", dbErr);
//       return res.status(500).json({ success: false, message: "Failed to update profile", error: dbErr.message });
//     }
//   });
// });

// // Serve static files from the 'uploads' directory
// app.use('/uploads', express.static('uploads'));

// app.listen(port, () => {
//   console.log(`🚀 Server running on http://localhost:${port}`);
// });