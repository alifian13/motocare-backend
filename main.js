require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { sequelize, User, Vehicle } = require("./models"); // Impor dari models/index.js

const userRoutes = require("./routes/userRoutes");
const vehicleRoutes = require("./routes/vehiclesRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const path = require("path");

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Basic Route
app.get("/", (req, res) => {
  res.send("🏍️ MotoCare API is running!");
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack);
  res
    .status(500)
    .send({ error: "Something went wrong!", details: err.message });
});

// Sinkronisasi database dan jalankan server
async function startServer() {
  try {
    // await sequelize.sync(); // Hati-hati: { force: true } akan drop tabel
    await sequelize.sync({ alter: true }); // Mencoba mencocokkan tabel dengan model
    console.log("Database synced successfully.");
    app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to sync database:", error);
    process.exit(1); // Keluar jika tidak bisa sync DB
  }
}

startServer();
