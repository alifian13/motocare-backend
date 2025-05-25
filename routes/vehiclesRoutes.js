// routes/vehicleRoutes.js
const express = require('express');
const { ServiceHistory } = require('../models'); // Impor ServiceHistory
const authMiddleware = require('../utils/authMiddleware');
const router = express.Router();
// --- Get Vehicles for Logged-in User ---
// GET /api/vehicles/my-vehicles
router.get('/my-vehicles', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // Diambil dari token setelah authMiddleware

    const vehicles = await Vehicle.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']], // Kolom di DB mungkin 'created_at'
      // attributes: { exclude: ['user_id'] } // Contoh jika ingin exclude kolom
    });

    if (!vehicles || vehicles.length === 0) {
      return res.json([]); // Kembalikan array kosong jika tidak ada, bukan 404
    }

    res.json(vehicles);

  } catch (error) {
    console.error('Error mengambil kendaraan pengguna:', error);
    res.status(500).json({ message: 'Error server saat mengambil kendaraan.', error: error.message });
  }
});

// --- Add a new vehicle for the logged-in user ---
// POST /api/vehicles/
router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
        plate_number,
        brand,
        model,
        current_odometer,
        last_service_date, // Format YYYY-MM-DD
        photo_url
    } = req.body;

    if (!plate_number || !brand || !model) {
        return res.status(400).json({ message: 'Nomor plat, brand, dan model wajib diisi.' });
    }

    try {
        const newVehicle = await Vehicle.create({
            user_id: userId,
            plate_number,
            brand,
            model,
            current_odometer: current_odometer || 0,
            last_service_date: last_service_date || null,
            photo_url: photo_url || null,
            last_odometer_update: new Date(),
        });

        res.status(201).json({
            message: 'Kendaraan berhasil ditambahkan!',
            vehicle: newVehicle, // Kirim kembali data kendaraan yang baru dibuat
        });
    } catch (error) {
        console.error('Error menambahkan kendaraan:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Nomor plat sudah ada.' });
        }
        if (error.name === 'SequelizeValidationError') {
            const messages = error.errors.map(e => e.message);
            return res.status(400).json({ message: 'Validasi gagal', errors: messages });
        }
        res.status(500).json({ message: 'Error server saat menambahkan kendaraan.', error: error.message });
    }
});

// --- Get Service History for a Vehicle ---
// GET /api/vehicles/:vehicleId/history
router.get('/:vehicleId/history', authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id; // ID pengguna dari token JWT

    // Validasi apakah kendaraan milik pengguna yang terautentikasi
    const vehicle = await Vehicle.findOne({
      where: {
        vehicle_id: requestedVehicleId,
        user_id: userIdFromToken // Pastikan kendaraan ini milik user yang login
      }
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    const historyEntries = await ServiceHistory.findAll({
      where: { vehicle_id: requestedVehicleId },
      order: [['service_date', 'DESC']], // Urutkan berdasarkan tanggal servis terbaru
    });

    if (!historyEntries || historyEntries.length === 0) {
      return res.json([]); // Kembalikan array kosong jika tidak ada riwayat
    }

    res.json(historyEntries);

  } catch (error) {
    console.error('Error fetching service history:', error);
    res.status(500).json({ message: 'Server error while fetching service history.', error: error.message });
  }
});

// GET /api/vehicles/:vehicleId/schedules
router.get('/:vehicleId/schedules', authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;
    // Validasi kepemilikan kendaraan (sama seperti di endpoint history)
    const vehicle = await Vehicle.findOne({ where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken }});
    if (!vehicle) return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak memiliki akses.' });

    const schedules = await MaintenanceSchedule.findAll({
      where: { vehicle_id: requestedVehicleId, status: ['PENDING', 'UPCOMING', 'OVERDUE'] }, // Hanya tampilkan yang relevan
      order: [['next_due_date', 'ASC'], ['next_due_odometer', 'ASC']],
    });
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching maintenance schedules:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// TODO: Implementasikan endpoint lain menggunakan Sequelize
// GET /api/vehicles/:vehicleId
// PUT /api/vehicles/:vehicleId
// ...dan seterusnya

module.exports = router;// routes/vehicleRoutes.js
// const express = require('express');
// Impor model dari objek db yang diekspor oleh models/index.js
const { Vehicle, MaintenanceSchedule } = require('../models');
// Pastikan path ke authMiddleware sudah benar
// const authMiddleware = require('../middleware/authMiddleware'); // Jika ada di folder middleware
// const authMiddleware = require('../utils/authMiddleware'); // Jika ada di folder utils

// const router = express.Router();

// --- Get Vehicles for Logged-in User ---
// GET /api/vehicles/my-vehicles
router.get('/my-vehicles', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const vehicles = await Vehicle.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });
    if (!vehicles || vehicles.length === 0) {
      return res.json([]);
    }
    res.json(vehicles);
  } catch (error) {
    console.error('Error mengambil kendaraan pengguna:', error);
    res.status(500).json({ message: 'Error server saat mengambil kendaraan.', error: error.message });
  }
});

// --- Add a new vehicle for the logged-in user ---
// POST /api/vehicles/
router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
        plate_number,
        brand,
        model,
        current_odometer,
        last_service_date,
        photo_url
    } = req.body;

    if (!plate_number || !brand || !model) {
        return res.status(400).json({ message: 'Nomor plat, brand, dan model wajib diisi.' });
    }

    try {
        const newVehicle = await Vehicle.create({ // Menggunakan Sequelize create
            user_id: userId,
            plate_number,
            brand,
            model,
            current_odometer: current_odometer || 0,
            last_service_date: last_service_date || null,
            photo_url: photo_url || null,
            last_odometer_update: new Date(),
        });

        res.status(201).json({
            message: 'Kendaraan berhasil ditambahkan!',
            vehicle: newVehicle,
        });
    } catch (error) {
        console.error('Error menambahkan kendaraan:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Nomor plat sudah ada.' });
        }
        if (error.name === 'SequelizeValidationError') {
            const messages = error.errors.map(e => e.message);
            return res.status(400).json({ message: 'Validasi gagal', errors: messages });
        }
        res.status(500).json({ message: 'Error server saat menambahkan kendaraan.', error: error.message });
    }
});

// --- Get Service History for a Vehicle ---
// GET /api/vehicles/:vehicleId/history
router.get('/:vehicleId/history', authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken }
    });
    if (!vehicle) {
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    const historyEntries = await ServiceHistory.findAll({
      where: { vehicle_id: requestedVehicleId },
      order: [['service_date', 'DESC']],
    });
    if (!historyEntries || historyEntries.length === 0) {
      return res.json([]);
    }
    res.json(historyEntries);
  } catch (error) {
    console.error('Error fetching service history:', error);
    res.status(500).json({ message: 'Server error while fetching service history.', error: error.message });
  }
});

// GET /api/vehicles/:vehicleId/schedules
router.get('/:vehicleId/schedules', authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({ where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken }});
    if (!vehicle) {
        return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    // Pastikan MaintenanceSchedule sudah diimpor dan terdefinisi
    if (!MaintenanceSchedule) {
        console.error("MaintenanceSchedule model is undefined in vehicleRoutes!");
        return res.status(500).json({ message: 'Server configuration error (MaintenanceSchedule not found).' });
    }

    const schedules = await MaintenanceSchedule.findAll({
      where: { vehicle_id: requestedVehicleId, status: ['PENDING', 'UPCOMING', 'OVERDUE'] },
      order: [['next_due_date', 'ASC'], ['next_due_odometer', 'ASC']],
    });
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching maintenance schedules:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Endpoint POST untuk history dan schedules juga harus menggunakan model Sequelize
// seperti contoh yang saya berikan di respons sebelumnya untuk menambahkan data.

module.exports = router;