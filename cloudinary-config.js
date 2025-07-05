// Cloudinary configuration for image uploads
require("dotenv").config();
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Debug log to verify configuration
console.log("Cloudinary Config Debug:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? "Set" : "Not Set",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "Set" : "Not Set",
});

module.exports = cloudinary;
