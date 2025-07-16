const express = require("express");
const bcrypt = require("bcryptjs");
const Userauth = require("../models/user.model");
const Motorauth = require("../models/vehicle.model");
const router = express.Router();

// Register Route
router.post("/register", async (req, res) => {
  const {
    email,
    nama,
    alamat,
    password,
    plat_nomor,
    brand,
    model,
    odometer,
    last_service_date,
  } = req.body;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Insert user data
    const newUser = {
      email,
      nama,
      alamat,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await Userauth.insert_data(newUser);

    // Insert motor data
    const motorData = {
      plat_nomor,
      email,
      brand,
      model,
      odometer,
      last_service_date,
    };

    await Motorauth.insert_data(motorData);

    res.status(201).json({ message: "User and motor added successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error in registering user and adding motor",
      error,
      requestData: req.body,
    });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await Userauth.findOne({ where: { email } });
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid password" });
  }

  res.status(200).json({ message: "Login successful", user });
});

module.exports = router;
