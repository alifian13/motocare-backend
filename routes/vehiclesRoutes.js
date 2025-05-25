// routes/vehicleRoutes.js
const express = require("express");
const {
  Vehicle,
  ServiceHistory,
  MaintenanceSchedule,
  Trip,
  sequelize,
} = require("../models");
const authMiddleware = require("../utils/authMiddleware"); // Sesuaikan path
const {
  checkAndGenerateSchedulesAndNotifications,
} = require("../utils/maintenanceScheduler"); // Sesuaikan path
// const NodeGeocoder = require('node-geocoder'); // Uncomment jika pakai reverse geocoding
// const geocoder = NodeGeocoder({ provider: 'openstreetmap' }); // Uncomment jika pakai

const router = express.Router();

// --- Get All Vehicles for Logged-in User ---
// GET /api/vehicles/my-vehicles
router.get("/my-vehicles", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const vehicles = await Vehicle.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });
    res.json(vehicles); // Akan mengembalikan [] jika tidak ada
  } catch (error) {
    console.error("Error mengambil kendaraan pengguna:", error);
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

// --- Add a New Vehicle (setelah user login, bukan saat registrasi awal) ---
// POST /api/vehicles/
router.post("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    plate_number,
    brand,
    model,
    current_odometer,
    last_service_date,
    photo_url,
    // Anda bisa menambahkan logika getLogoUrl di sini juga jika diperlukan
  } = req.body;

  if (!plate_number || !brand || !model) {
    return res
      .status(400)
      .json({ message: "Nomor plat, brand, dan model wajib diisi." });
  }
  // Impor fungsi getLogoUrl jika ingin digunakan di sini
  // const { getLogoUrl } = require('./userRoutes'); // Atau pindahkan getLogoUrl ke utils

  try {
    // const logoUrlForVehicle = getLogoUrl(brand, model); // Jika getLogoUrl dipindahkan ke utils
    const newVehicle = await Vehicle.create({
      user_id: userId,
      plate_number,
      brand,
      model,
      current_odometer: current_odometer || 0,
      last_service_date: last_service_date || null,
      // logo_url: logoUrlForVehicle,
      photo_url: photo_url || null,
      last_odometer_update: new Date(),
    });

    generateInitialSchedules(newVehicle.vehicle_id).catch((err) => {
      // Buat jadwal awal
      console.error("Error generating initial schedules for new vehicle:", err);
    });

    res
      .status(201)
      .json({
        message: "Kendaraan berhasil ditambahkan!",
        vehicle: newVehicle,
      });
  } catch (error) {
    console.error("Error menambahkan kendaraan:", error);
    // ... (penanganan error SequelizeValidationError dan SequelizeUniqueConstraintError)
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

// --- Get Service History ---
// GET /api/vehicles/:vehicleId/history
router.get("/:vehicleId/history", authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
    });
    if (!vehicle)
      return res
        .status(404)
        .json({ message: "Kendaraan tidak ditemukan/tidak diizinkan." });

    const historyEntries = await ServiceHistory.findAll({
      where: { vehicle_id: requestedVehicleId },
      order: [["service_date", "DESC"]],
    });
    res.json(historyEntries);
  } catch (error) {
    console.error("Error fetching service history:", error);
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

// --- Add Service History ---
// POST /api/vehicles/:vehicleId/history
router.post("/:vehicleId/history", authMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
      transaction: t,
    });
    if (!vehicle) {
      await t.rollback();
      return res
        .status(404)
        .json({ message: "Kendaraan tidak ditemukan/tidak diizinkan." });
    }

    const {
      service_date,
      odometer_at_service,
      service_type,
      description,
      workshop_name,
      cost,
    } = req.body;
    if (!service_date || odometer_at_service === undefined || !service_type) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Tanggal, odometer, dan tipe servis wajib." });
    }

    const newHistoryEntry = await ServiceHistory.create(
      {
        vehicle_id: requestedVehicleId,
        service_date,
        odometer_at_service: parseInt(odometer_at_service, 10),
        service_type,
        description: description || null,
        workshop_name: workshop_name || null,
        cost: cost ? parseFloat(cost) : null,
      },
      { transaction: t }
    );

    // Update odometer dan tanggal servis terakhir di tabel vehicles
    let vehicleNeedsUpdate = false;
    const newServiceOdometer = parseInt(odometer_at_service, 10);
    const newServiceDate = new Date(service_date);

    if (newServiceOdometer > (parseFloat(vehicle.current_odometer) || 0)) {
      vehicle.current_odometer = newServiceOdometer;
      vehicle.last_odometer_update = new Date();
      vehicleNeedsUpdate = true;
    }
    if (
      !vehicle.last_service_date ||
      newServiceDate > new Date(vehicle.last_service_date)
    ) {
      vehicle.last_service_date = service_date;
      vehicleNeedsUpdate = true;
    }
    if (vehicleNeedsUpdate) {
      await vehicle.save({ transaction: t });
    }

    // Update status jadwal terkait
    const relatedSchedule = await MaintenanceSchedule.findOne({
      where: {
        vehicle_id: requestedVehicleId,
        item_name: newHistoryEntry.service_type,
        status: ["OVERDUE", "UPCOMING", "PENDING"],
      },
      transaction: t,
    });
    if (relatedSchedule) {
      relatedSchedule.status = "COMPLETED";
      relatedSchedule.last_performed_date = newHistoryEntry.service_date;
      relatedSchedule.last_performed_odometer =
        newHistoryEntry.odometer_at_service;
      await relatedSchedule.save({ transaction: t });

      // Hapus notifikasi terkait yang sudah tidak relevan
      const { Notification } = require("../models"); // Impor di sini jika belum
      await Notification.destroy({
        where: {
          schedule_id: relatedSchedule.schedule_id,
          user_id: userIdFromToken,
        },
        transaction: t,
      });
    }
    await t.commit();

    checkAndGenerateSchedulesAndNotifications(requestedVehicleId).catch(
      (err) => {
        console.error("Error generating schedules post-history:", err);
      }
    );

    res
      .status(201)
      .json({
        message: "Riwayat servis berhasil ditambahkan!",
        data: newHistoryEntry,
      });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error("Error adding service history:", error);
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

// --- Get Maintenance Schedules ---
// GET /api/vehicles/:vehicleId/schedules
router.get("/:vehicleId/schedules", authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
    });
    if (!vehicle)
      return res
        .status(404)
        .json({ message: "Kendaraan tidak ditemukan/tidak diizinkan." });

    if (!MaintenanceSchedule)
      return res.status(500).json({ message: "Konfigurasi server error." });

    const schedules = await MaintenanceSchedule.findAll({
      where: {
        vehicle_id: requestedVehicleId,
        status: ["PENDING", "UPCOMING", "OVERDUE"],
      },
      order: [
        [sequelize.fn("isnull", sequelize.col("next_due_date")), "ASC"], // NULLs last for date
        ["next_due_date", "ASC"],
        [sequelize.fn("isnull", sequelize.col("next_due_odometer")), "ASC"], // NULLs last for odo
        ["next_due_odometer", "ASC"],
      ],
    });
    res.json(schedules);
  } catch (error) {
    console.error("Error fetching maintenance schedules:", error);
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

// --- Add Maintenance Schedule (Manual by User) ---
// POST /api/vehicles/:vehicleId/schedules
router.post("/:vehicleId/schedules", authMiddleware, async (req, res) => {
  // ... (Kode POST /schedules yang sudah ada dari contoh saya sebelumnya) ...
  // Pastikan menggunakan MaintenanceSchedule.create()
});

// --- Record Trip ---
// POST /api/vehicles/:vehicleId/trips
router.post("/:vehicleId/trips", authMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
      transaction: t,
    });
    if (!vehicle) {
      await t.rollback();
      return res
        .status(404)
        .json({ message: "Kendaraan tidak ditemukan/tidak diizinkan." });
    }

    const {
      distance_km,
      start_time,
      end_time,
      start_latitude,
      start_longitude,
      end_latitude,
      end_longitude,
    } = req.body;

    if (
      distance_km == null ||
      isNaN(parseFloat(distance_km)) ||
      parseFloat(distance_km) <= 0
    ) {
      await t.rollback();
      return res.status(400).json({ message: "Jarak tempuh wajib & > 0." });
    }

    // ... (Logika reverse geocoding jika ada) ...

    const newTrip = await Trip.create(
      {
        vehicle_id: requestedVehicleId,
        distance_km: parseFloat(distance_km),
        start_time: start_time || null, // Frontend sebaiknya mengirim ini
        end_time: end_time || new Date(), // Frontend sebaiknya mengirim ini
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        // start_address, end_address
      },
      { transaction: t }
    );

    const currentOdo = parseFloat(vehicle.current_odometer) || 0;
    const newOdometer = currentOdo + parseFloat(distance_km);
    vehicle.current_odometer = newOdometer.toFixed(1); // Simpan dengan 1 desimal jika perlu
    vehicle.last_odometer_update = new Date();
    await vehicle.save({ transaction: t });

    await t.commit();

    checkAndGenerateSchedulesAndNotifications(requestedVehicleId).catch(
      (err) => {
        console.error("Error generating schedules post-trip:", err);
      }
    );

    res.status(201).json({
      message: "Perjalanan berhasil dicatat.",
      trip: newTrip,
      newOdometer: vehicle.current_odometer,
    });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    console.error("Error mencatat perjalanan:", error);
    res.status(500).json({ message: "Error server.", error: error.message });
  }
});

module.exports = router;
