const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary-config");
const connectDB = require("./config/database");
const Image = require("./models/Image");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Connect to MongoDB
connectDB();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify email connection
transporter.verify((error, success) => {
  if (error) {
    console.log("Email configuration error:", error);
  } else {
    console.log("Email server is ready to take our messages");
  }
});

// Enable CORS with specific origins
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "adriana-photography", // Folder in Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
    transformation: [{ quality: "auto", fetch_format: "auto" }], // Optimize images
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (increased for higher quality)
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Upload endpoint
app.post(
  "/api/upload",
  upload.fields([{ name: "image", maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.image || !req.files.image[0]) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const imageKey = req.body.imageKey;
      console.log(`Received upload request - Image Key: ${imageKey}`);

      if (!imageKey) {
        return res.status(400).json({ error: "Image key is required" });
      }

      const uploadedFile = req.files.image[0];

      // Create or update image document in MongoDB
      const imageDoc = await Image.findOneAndUpdate(
        { imageKey },
        {
          imageKey,
          url: uploadedFile.path, // Cloudinary URL
          publicId: uploadedFile.filename, // Cloudinary public ID
          originalName: uploadedFile.originalname,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
          uploadedAt: new Date().toISOString(),
        },
        { upsert: true, new: true }
      );

      console.log(
        `Image uploaded successfully - Key: ${imageKey}, URL: ${uploadedFile.path}`
      );

      res.status(200).json({
        success: true,
        imageUrl: uploadedFile.path, // Return Cloudinary URL
        imageKey,
        publicId: uploadedFile.filename,
        data: imageDoc,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "File upload failed" });
    }
  }
);

// Get all images endpoint
app.get("/api/images", async (req, res) => {
  try {
    const images = await Image.find({}).sort({ uploadedAt: -1 });

    console.log(
      `Fetching all images - Found ${images.length} images in database`
    );

    // Convert to object format for backward compatibility
    const imageData = {};
    images.forEach((img) => {
      imageData[img.imageKey] = {
        url: img.url,
        publicId: img.publicId,
        originalName: img.originalName,
        size: img.size,
        mimetype: img.mimetype,
        uploadedAt: img.uploadedAt,
      };
    });

    res.json(imageData);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// Get specific image by key
app.get("/api/images/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const image = await Image.findOne({ imageKey: key });

    if (image) {
      res.json({
        url: image.url,
        publicId: image.publicId,
        originalName: image.originalName,
        size: image.size,
        mimetype: image.mimetype,
        uploadedAt: image.uploadedAt,
      });
    } else {
      res.status(404).json({ error: "Image not found" });
    }
  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// Delete image endpoint
app.delete("/api/images/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const image = await Image.findOne({ imageKey: key });

    if (image) {
      // Delete from Cloudinary if it has a publicId
      if (image.publicId) {
        await cloudinary.uploader.destroy(image.publicId);
      }

      // Remove from MongoDB
      await Image.deleteOne({ imageKey: key });

      res.json({ success: true, message: "Image deleted successfully" });
    } else {
      res.status(404).json({ error: "Image not found" });
    }
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// Email endpoint
app.post("/api/send-email", async (req, res) => {
  try {
    const { name, email, phone, sessionType, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        error: "Name, email, and message are required fields",
      });
    }

    // Email to admin (Adriana)
    const adminMailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: process.env.TO_EMAIL,
      subject: `New Photography Session Inquiry from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background: linear-gradient(135deg, #2d5016 0%, #3d6b1f 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Session Inquiry</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #2d5016; margin-bottom: 20px;">Contact Details</h2>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #2d5016;">Name:</strong>
              <span style="margin-left: 10px; color: #333;">${name}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #2d5016;">Email:</strong>
              <span style="margin-left: 10px; color: #333;">${email}</span>
            </div>
            
            ${
              phone
                ? `
            <div style="margin-bottom: 15px;">
              <strong style="color: #2d5016;">Phone:</strong>
              <span style="margin-left: 10px; color: #333;">${phone}</span>
            </div>
            `
                : ""
            }
            
            ${
              sessionType
                ? `
            <div style="margin-bottom: 15px;">
              <strong style="color: #2d5016;">Session Type:</strong>
              <span style="margin-left: 10px; color: #333;">${sessionType}</span>
            </div>
            `
                : ""
            }
            
            <div style="margin-top: 25px;">
              <strong style="color: #2d5016;">Message:</strong>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #c5964f;">
                ${message}
              </div>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #c5964f 0%, #d4a574 100%); border-radius: 5px; text-align: center;">
              <p style="margin: 0; color: white; font-weight: bold;">
                📸 Reply to this email to respond directly to ${name}
              </p>
            </div>
          </div>
        </div>
      `,
      replyTo: email,
    };

    // Confirmation email to client
    const clientMailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: "Thank you for your photography inquiry!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background: linear-gradient(135deg, #2d5016 0%, #3d6b1f 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Adriana Loredo Photography</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #2d5016; margin-bottom: 20px;">Thank You, ${name}!</h2>
            
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
              Thank you for reaching out about your photography session. I'm so excited to learn more about your vision and help capture your special moments!
            </p>
            
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
              I've received your inquiry and will get back to you within 24-48 hours to discuss:
            </p>
            
            <ul style="color: #333; line-height: 1.6; margin-bottom: 25px; padding-left: 25px;">
              <li>Your session details and preferences</li>
              <li>Available dates and locations</li>
              <li>Package options and pricing</li>
              <li>Any special requests or ideas you have</li>
            </ul>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; border-left: 4px solid #c5964f; margin: 25px 0;">
              <h3 style="color: #2d5016; margin: 0 0 10px 0; font-size: 16px;">Your Inquiry Summary:</h3>
              <p style="margin: 5px 0; color: #333;"><strong>Session Type:</strong> ${
                sessionType || "Not specified"
              }</p>
              <p style="margin: 5px 0; color: #333;"><strong>Contact:</strong> ${email}${
        phone ? ` | ${phone}` : ""
      }</p>
            </div>
            
            <p style="color: #333; line-height: 1.6; margin-bottom: 25px;">
              In the meantime, feel free to browse my portfolio on my website or follow me on social media for the latest work and behind-the-scenes content.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background: linear-gradient(135deg, #c5964f 0%, #d4a574 100%); padding: 15px 30px; border-radius: 25px; display: inline-block;">
                <p style="margin: 0; color: white; font-weight: bold;">
                  📸 Looking forward to creating beautiful memories together!
                </p>
              </div>
            </div>
            
            <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Adriana Loredo Photography<br>
                📞 361-947-5322 | ✉️ adrianaloredophotography@gmail.com<br>
                📍 San Antonio, TX
              </p>
            </div>
          </div>
        </div>
      `,
    };

    // Send both emails
    await Promise.all([
      transporter.sendMail(adminMailOptions),
      transporter.sendMail(clientMailOptions),
    ]);

    res.status(200).json({
      success: true,
      message: "Emails sent successfully!",
    });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({
      error: "Failed to send email",
      details: error.message,
    });
  }
});

// Authentication endpoint
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate credentials against environment variables
    if (
      username === process.env.ADMIN_USERNAME &&
      password === process.env.ADMIN_PASSWORD
    ) {
      res.status(200).json({
        success: true,
        message: "Authentication successful",
      });
    } else {
      res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Welcome to the Image Upload API");
});
