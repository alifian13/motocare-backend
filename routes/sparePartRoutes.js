const express = require('express');
const { SparePart, Vehicle } = require('../models');
const authMiddleware = require('../utils/authMiddleware');
const router = express.Router();

// GET /api/spare-parts/for-vehicle/:vehicleId/:serviceName
router.get('/for-vehicle/:vehicleId/:serviceName', authMiddleware, async (req, res) => {
  const { vehicleId, serviceName } = req.params;
  const userId = req.user.id;

  try {
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: vehicleId, user_id: userId },
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak punya akses.' });
    }

    if (!vehicle.vehicle_code) {
      return res.status(404).json({ message: 'Informasi kode spare part untuk model kendaraan ini belum tersedia.' });
    }

    const sparePart = await SparePart.findOne({
      where: {
        vehicle_code: vehicle.vehicle_code,
        service_name: serviceName,
      },
    });

    if (!sparePart) {
      return res.status(404).json({ message: `Spare part untuk "${serviceName}" pada model ini tidak ditemukan.` });
    }

    res.json(sparePart);
  } catch (error) {
    console.error('[SPARE_PART_ROUTE] Error:', error);
    res.status(500).json({ message: 'Gagal mengambil data spare part.', error: error.message });
  }
});

// GET /api/spare-parts/by-vehicle/:vehicleId
router.get('/by-vehicle/:vehicleId', authMiddleware, async (req, res) => {
  const { vehicleId } = req.params;
  const userId = req.user.id;

  try {
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: vehicleId, user_id: userId },
    });

    if (!vehicle || !vehicle.vehicle_code) {
      return res.status(404).json({ message: 'Informasi spare part untuk model kendaraan ini belum tersedia.' });
    }

    const spareParts = await SparePart.findAll({
      where: {
        vehicle_code: vehicle.vehicle_code,
      },
      order: [['part_name', 'ASC']],
    });

    if (!spareParts || spareParts.length === 0) {
        return res.status(404).json({ message: `Tidak ada spare part yang terdaftar untuk model ${vehicle.model} (${vehicle.vehicle_code}).` });
    }

    res.json(spareParts);
  } catch (error) {
    console.error('[SPARE_PART_LIST_ROUTE] Error:', error);
    res.status(500).json({ message: 'Gagal mengambil daftar spare part.', error: error.message });
  }
}); 

module.exports = router;