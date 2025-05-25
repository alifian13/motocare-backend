const express = require('express');
const { Vehicle, ServiceHistory, MaintenanceSchedule, Trip, sequelize } = require('../models');
const authMiddleware = require('../utils/authMiddleware'); // Sesuaikan path
const { checkAndGenerateSchedulesAndNotifications } = require('../utils/maintenanceScheduler'); // Sesuaikan path
// const NodeGeocoder = require('node-geocoder'); // Uncomment jika pakai reverse geocoding
// const geocoder = NodeGeocoder({ provider: 'openstreetmap' }); // Uncomment jika pakai
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

// --- Add Service History ---
// POST /api/vehicles/:vehicleId/history
router.post('/:vehicleId/history', authMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
      transaction: t
    });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan/tidak diizinkan.' });
    }

    const { service_date, odometer_at_service, service_type, description, workshop_name, cost } = req.body;
    if (!service_date || odometer_at_service === undefined || !service_type) {
      await t.rollback();
      return res.status(400).json({ message: 'Tanggal, odometer, dan tipe servis wajib.' });
    }

    const newHistoryEntry = await ServiceHistory.create({
      vehicle_id: requestedVehicleId, service_date,
      odometer_at_service: parseInt(odometer_at_service, 10),
      service_type, description: description || null,
      workshop_name: workshop_name || null, cost: cost ? parseFloat(cost) : null,
    }, { transaction: t });

    // Update odometer dan tanggal servis terakhir di tabel vehicles
    let vehicleNeedsUpdate = false;
    const newServiceOdometer = parseInt(odometer_at_service, 10);
    const newServiceDate = new Date(service_date);

    if (newServiceOdometer > (parseFloat(vehicle.current_odometer) || 0)) {
        vehicle.current_odometer = newServiceOdometer;
        vehicle.last_odometer_update = new Date();
        vehicleNeedsUpdate = true;
    }
    if (!vehicle.last_service_date || newServiceDate > new Date(vehicle.last_service_date)) {
        vehicle.last_service_date = service_date;
        vehicleNeedsUpdate = true;
    }
    if (vehicleNeedsUpdate) {
        await vehicle.save({ transaction: t });
    }

  // Update status jadwal terkait
    const relatedSchedule = await MaintenanceSchedule.findOne({
      where: {
        vehicle_id: requestedVehicleId, item_name: newHistoryEntry.service_type,
        status: ['OVERDUE', 'UPCOMING', 'PENDING']
      },
      transaction: t
    });
    if (relatedSchedule) {
      relatedSchedule.status = 'COMPLETED';
      relatedSchedule.last_performed_date = newHistoryEntry.service_date;
      relatedSchedule.last_performed_odometer = newHistoryEntry.odometer_at_service;
      await relatedSchedule.save({ transaction: t });

      // Hapus notifikasi terkait yang sudah tidak relevan
      const { Notification } = require('../models'); // Impor di sini jika belum
      await Notification.destroy({
          where: { schedule_id: relatedSchedule.schedule_id, user_id: userIdFromToken },
          transaction: t
      });
    }
    await t.commit();

    checkAndGenerateSchedulesAndNotifications(requestedVehicleId).catch(err => {
        console.error("Error generating schedules post-history:", err);
    });

    res.status(201).json({ message: 'Riwayat servis berhasil ditambahkan!', data: newHistoryEntry });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error('Error adding service history:', error);
    res.status(500).json({ message: 'Error server.', error: error.message });
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

// --- Add Maintenance Schedule (Manual by User) ---
// POST /api/vehicles/:vehicleId/schedules
router.post('/:vehicleId/schedules', authMiddleware, async (req, res) => {
    // ... (Kode POST /schedules yang sudah ada dari contoh saya sebelumnya) ...
    // Pastikan menggunakan MaintenanceSchedule.create()
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

router.post('/:vehicleId/trips', authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken }
    });
    if (!vehicle) {
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau tidak diizinkan.' });
    }

    const {
      distance_km,
      start_time,
      end_time,
      start_latitude, start_longitude,
      end_latitude, end_longitude
    } = req.body;

    if (!distance_km || isNaN(parseFloat(distance_km))) {
      return res.status(400).json({ message: 'Jarak tempuh wajib diisi dan harus angka.' });
    }

    let startAddress = null;
    let endAddress = null;

    // (Opsional) Reverse geocoding menggunakan OSM jika koordinat ada
    if (start_latitude && start_longitude) {
      try {
        const geoRes = await geocoder.reverse({ lat: start_latitude, lon: start_longitude });
        if (geoRes.length > 0) startAddress = geoRes[0].formattedAddress;
      } catch (geoError) { console.error("Error reverse geocoding start:", geoError); }
    }
    if (end_latitude && end_longitude) {
      try {
        const geoRes = await geocoder.reverse({ lat: end_latitude, lon: end_longitude });
        if (geoRes.length > 0) endAddress = geoRes[0].formattedAddress;
      } catch (geoError) { console.error("Error reverse geocoding end:", geoError); }
    }

    const t = await sequelize.transaction();
    try {
        const newTrip = await Trip.create({
          vehicle_id: requestedVehicleId,
          distance_km: parseFloat(distance_km),
          start_time: start_time || null,
          end_time: end_time || new Date(),
          start_latitude, start_longitude, end_latitude, end_longitude,
          start_address: startAddress,
          end_address: endAddress
        }, { transaction: t });

        // Update odometer kendaraan
        const newOdometer = (parseFloat(vehicle.current_odometer) || 0) + parseFloat(distance_km);
        vehicle.current_odometer = newOdometer;
        vehicle.last_odometer_update = new Date();
        await vehicle.save({ transaction: t });

        await t.commit();

        // Setelah odometer diupdate, panggil fungsi untuk cek dan buat jadwal/notifikasi
        await checkAndGenerateSchedulesAndNotifications(requestedVehicleId);

        res.status(201).json({ message: 'Perjalanan berhasil dicatat dan odometer diperbarui.', trip: newTrip, newOdometer: vehicle.current_odometer });

    } catch (dbError) {
        await t.rollback();
        throw dbError; // Lemparkan lagi untuk ditangkap oleh blok catch luar
    }

  } catch (error) {
    console.error('Error mencatat perjalanan:', error);
    res.status(500).json({ message: 'Server error saat mencatat perjalanan.', error: error.message });
  }
});

// Endpoint POST untuk history dan schedules juga harus menggunakan model Sequelize
// seperti contoh yang saya berikan di respons sebelumnya untuk menambahkan data.

module.exports = router;