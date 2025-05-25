const express = require("express");
const Service = require("../models/Service");
const { authenticate } = require("../utils/authMiddleware");
const router = express.Router();

// Add Service
router.post("/", authenticate, async (req, res) => {
  const { plat_nomor, jenis_service, kilometer_service } = req.body;
  try {
    const serviceData = { plat_nomor, jenis_service, kilometer_service };
    await Service.insert_data(serviceData);
    res.status(201).json({ message: "Service added successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error in adding service", error });
  }
});

// Update Service
router.put("/:id_service", authenticate, async (req, res) => {
  const { id_service } = req.params;
  const serviceData = req.body;

  try {
    await Service.update_data(serviceData, id_service);
    res.status(200).json({ message: "Service updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error in updating service", error });
  }
});

module.exports = router;
