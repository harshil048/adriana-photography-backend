const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS with specific origins
app.use(
  cors({
    origin: [
      "https://adriana-photography.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json());

// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Store image metadata
let imageData = {};

// Load existing image data if available
try {
  if (fs.existsSync(path.join(__dirname, "imageData.json"))) {
    const data = fs.readFileSync(
      path.join(__dirname, "imageData.json"),
      "utf8"
    );
    imageData = JSON.parse(data);
  }
} catch (error) {
  console.error("Error loading image data:", error);
}

// Save image data to file
const saveImageData = () => {
  fs.writeFileSync(
    path.join(__dirname, "imageData.json"),
    JSON.stringify(imageData),
    "utf8"
  );
};

// Upload endpoint
app.post("/api/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imageKey = req.body.imageKey;
    if (!imageKey) {
      return res.status(400).json({ error: "Image key is required" });
    }

    // Store image metadata
    imageData[imageKey] = {
      url: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    };

    // Save updated image data
    saveImageData();

    res.status(200).json({
      success: true,
      imageUrl: `/uploads/${req.file.filename}`,
      imageKey,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
});

// Get all images endpoint
app.get("/api/images", (req, res) => {
  res.json(imageData);
});

// Get specific image by key
app.get("/api/images/:key", (req, res) => {
  const { key } = req.params;
  if (imageData[key]) {
    res.json(imageData[key]);
  } else {
    res.status(404).json({ error: "Image not found" });
  }
});

// Delete image endpoint
app.delete("/api/images/:key", (req, res) => {
  const { key } = req.params;

  if (imageData[key]) {
    // Get the filename from the URL
    const filename = path.basename(imageData[key].url);
    const filePath = path.join(__dirname, "uploads", filename);

    // Delete the file if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from our data
    delete imageData[key];
    saveImageData();

    res.json({ success: true, message: "Image deleted successfully" });
  } else {
    res.status(404).json({ error: "Image not found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
