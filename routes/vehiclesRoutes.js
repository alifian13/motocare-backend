const express = require("express");
const { Op } = require('sequelize');
const {
  Vehicle,
  ServiceHistory,
  MaintenanceSchedule,
  Trip,
  Notification,
  sequelize,
} = require("../models");
const authMiddleware = require("../utils/authMiddleware");
const {
  checkAndGenerateSchedulesAndNotifications,
  generateInitialSchedules, 
} = require("../utils/maintenanceScheduler");
const axios = require("axios");

const router = express.Router();

async function getAddressFromCoordinates(latitude, longitude) {
  if (!latitude || !longitude) {
    return null;
  }
  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          lat: latitude,
          lon: longitude,
          format: "json",
          zoom: 18,
        },
        headers: {
          "User-Agent": "MotoCareApp/1.0.0 (Aplikasi Perawatan Motor MotoCare; Kontak: ilhamm6812@gmail.com)", // GANTI DENGAN INFO VALID
        },
      }
    );
    if (response.data && response.data.display_name) {
      console.log(`[GEOCODE_SUCCESS] Coords: ${latitude},${longitude} -> Address: ${response.data.display_name}`);
      return response.data.display_name;
    }
    console.warn(`[GEOCODE_WARN] No display_name for: ${latitude},${longitude}. Response:`, response.data);
    return null;
  } catch (error) {
    let errorMessage = error.message;
    if (error.response) {
      errorMessage = `Nominatim API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      errorMessage = "No response received from Nominatim API.";
    }
    console.error(`[GEOCODE_ERROR] Error geocoding ${latitude},${longitude}:`, errorMessage);
    return null;
  }
}

router.get("/my-vehicles", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const vehicles = await Vehicle.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });
    res.json(vehicles);
  } catch (error) {
    console.error("[VEHICLE_LIST_ERROR]", error);
    res.status(500).json({ message: "Error server saat mengambil kendaraan.", error: error.message });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    plate_number,
    brand,
    model,
    current_odometer,
    last_service_date,
    photo_url,
    logo_url,
  } = req.body;

  console.log('[VEHICLE_ADD_REQUEST] Received data:', req.body);

  if (!plate_number || !brand || !model) {
    return res.status(400).json({ message: "Nomor plat, brand, dan model wajib diisi." });
  }

  const t = await sequelize.transaction();
  try {
    const newVehicle = await Vehicle.create(
      {
        user_id: userId,
        plate_number,
        brand,
        model,
        current_odometer: parseInt(current_odometer, 10) || 0,
        last_service_date: last_service_date || null,
        logo_url: logo_url || null,
        photo_url: photo_url || null,
        last_odometer_update: new Date(),
      },
      { transaction: t }
    );
    console.log('[VEHICLE_ADD_SUCCESS] Vehicle created in DB:', newVehicle.vehicle_id);
    
    await t.commit(); 
    console.log('[VEHICLE_ADD_SUCCESS] Transaction committed for new vehicle.');

    if (newVehicle) {
      console.log(`[VEHICLE_ADD_SCHEDULER_TRIGGER] Triggering initial schedules for vehicle ${newVehicle.vehicle_id}`);
      generateInitialSchedules(newVehicle.vehicle_id).catch(err => {
        console.error(`[VEHICLE_ADD_SCHEDULER_ERROR] Error triggering initial scheduler for new vehicle ${newVehicle.vehicle_id}:`, err);
      });
    }

    res.status(201).json({
      message: "Kendaraan berhasil ditambahkan!",
      vehicle: newVehicle.toJSON(),
    });
  } catch (error) {
    if (t && !t.finished && !t.isRolledBack) {
       await t.rollback();
       console.log('[VEHICLE_ADD_ERROR] Transaction rolled back.');
    }
    console.error("[VEHICLE_ADD_ERROR] Error adding vehicle:", error);
    if (error.name === "SequelizeValidationError" || error.name === "SequelizeUniqueConstraintError") {
      const messages = error.errors.map((e) => e.message);
      return res.status(400).json({ message: "Validasi gagal atau data duplikat.", errors: messages });
    }
    res.status(500).json({ message: "Error server saat menambahkan kendaraan.", error: error.message });
  }
});

router.get("/:vehicleId/history", authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;

    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
    });
    if (!vehicle) {
      return res.status(404).json({ message: "Kendaraan tidak ditemukan atau Anda tidak diizinkan mengaksesnya." });
    }

    const historyEntries = await ServiceHistory.findAll({
      where: { vehicle_id: requestedVehicleId },
      order: [["service_date", "DESC"], ["created_at", "DESC"]],
    });
    res.json(historyEntries.map(h => h.toJSON()));
  } catch (error) {
    console.error("[SERVICE_HISTORY_LIST_ERROR]", error);
    res.status(500).json({ message: "Error server saat mengambil riwayat servis.", error: error.message });
  }
});

router.post('/:vehicleId/service-history', authMiddleware, async (req, res) => {
  const { vehicleId } = req.params;
  const userId = req.user.id;
  const {
    service_date,
    odometer_at_service,
    service_types,
    description,
    workshop_name,
    cost,
  } = req.body;

  console.log(`[SERVICE_HISTORY_ADD_REQUEST] Vehicle ID: ${vehicleId}, Data:`, req.body);

  if (!service_date || odometer_at_service === undefined || odometer_at_service === null || !service_types || !Array.isArray(service_types) || service_types.length === 0) {
    return res.status(400).json({ message: 'Tanggal, odometer, dan minimal satu jenis servis wajib diisi.' });
  }
  if (isNaN(parseFloat(odometer_at_service))) {
    return res.status(400).json({ message: 'Odometer harus berupa angka.' });
  }
  if (cost && isNaN(parseFloat(cost))) {
    return res.status(400).json({ message: 'Biaya harus berupa angka.' });
  }

  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findOne({ where: { vehicle_id: parseInt(vehicleId, 10), user_id: userId }, transaction: t });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau bukan milik Anda.' });
    }

    const createdHistories = [];
    for (const type of service_types) {
      if (!type || type.trim() === "") {
        console.warn('[SERVICE_HISTORY_ADD_WARN] Empty service_type skipped:', type);
        continue;
      }
      const history = await ServiceHistory.create({
        vehicle_id: parseInt(vehicleId, 10),
        service_date,
        odometer_at_service: parseFloat(odometer_at_service),
        service_type: type.trim(), // Trim spasi
        description: description || null,
        workshop_name: workshop_name || null,
        cost: cost ? parseFloat(cost) : null,
      }, { transaction: t });
      createdHistories.push(history);
      console.log(`[SERVICE_HISTORY_ADD_SUCCESS] Created history entry for type "${type}", ID: ${history.history_id}`);
    }

    if (createdHistories.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: 'Tidak ada riwayat servis yang valid untuk ditambahkan.' });
    }

    const odoAtServiceNum = parseFloat(odometer_at_service);
    if (odoAtServiceNum > (parseFloat(vehicle.current_odometer) || 0)) {
      vehicle.current_odometer = odoAtServiceNum;
    }
    if (!vehicle.last_service_date || new Date(service_date) > new Date(vehicle.last_service_date)) {
        vehicle.last_service_date = service_date;
    }
    vehicle.last_odometer_update = new Date();
    await vehicle.save({ transaction: t });
    console.log('[SERVICE_HISTORY_ADD_SUCCESS] Vehicle odometer and last_service_date updated.');

    await t.commit();
    console.log('[SERVICE_HISTORY_ADD_SUCCESS] Transaction committed.');

    console.log(`[SERVICE_HISTORY_ADD_SCHEDULER_TRIGGER] Triggering scheduler for vehicle ${vehicleId}`);
    checkAndGenerateSchedulesAndNotifications(parseInt(vehicleId, 10)).catch(err => {
      console.error("[SERVICE_HISTORY_ADD_SCHEDULER_ERROR] Error triggering scheduler:", err);
    });

    res.status(201).json({
      message: 'Riwayat servis berhasil ditambahkan.',
      histories: createdHistories.map(h => h.toJSON()),
      updatedOdometer: vehicle.current_odometer,
    });
  } catch (error) {
    if (t && !t.finished && !t.isRolledBack) {
      await t.rollback();
      console.log('[SERVICE_HISTORY_ADD_ERROR] Transaction rolled back.');
    }
    console.error('[SERVICE_HISTORY_ADD_ERROR] Error adding service history:', error);
    res.status(500).json({ message: 'Gagal menambah riwayat servis.', error: error.message, details: error.parent ? error.parent.sqlMessage : null });
  }
});

router.put("/:vehicleId/odometer", authMiddleware, async (req, res) => {
  const { vehicleId } = req.params;
  const userId = req.user.id;
  const { current_odometer: newOdometerValue } = req.body;

  console.log(`[VEHICLE_ODO_UPDATE_REQUEST] Vehicle ID: ${vehicleId}, New Odo: ${newOdometerValue}`);

  if (newOdometerValue === undefined || newOdometerValue === null) {
    return res.status(400).json({ message: "Nilai odometer baru wajib diisi (current_odometer)." });
  }
  const newOdometer = parseInt(newOdometerValue, 10);
  if (isNaN(newOdometer)) {
    return res.status(400).json({ message: "Nilai odometer baru harus berupa angka." });
  }

  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: parseInt(vehicleId, 10), user_id: userId },
      transaction: t,
    });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ message: "Kendaraan tidak ditemukan atau bukan milik Anda." });
    }
    const currentOdoInDb = parseInt(vehicle.current_odometer, 10) || 0;
    if (newOdometer < currentOdoInDb) { // Memperbolehkan odometer sama, hanya tidak boleh lebih kecil
      await t.rollback();
      return res.status(400).json({
        message: `Odometer baru (${newOdometer} km) tidak boleh lebih kecil dari odometer saat ini (${currentOdoInDb} km).`,
      });
    }
    vehicle.current_odometer = newOdometer;
    vehicle.last_odometer_update = new Date();
    await vehicle.save({ transaction: t });
    console.log(`[VEHICLE_ODO_UPDATE_SUCCESS] Vehicle ${vehicleId} odometer updated to ${newOdometer}.`);
    
    await t.commit();
    console.log('[VEHICLE_ODO_UPDATE_SUCCESS] Transaction committed.');

    console.log(`[VEHICLE_ODO_UPDATE_SCHEDULER_TRIGGER] Triggering scheduler for vehicle ${vehicleId}`);
    checkAndGenerateSchedulesAndNotifications(parseInt(vehicleId, 10)).catch((err) => {
      console.error(`[VEHICLE_ODO_UPDATE_SCHEDULER_ERROR] Error triggering scheduler for vehicle ${vehicleId}:`, err);
    });
    res.json({
      message: "Odometer berhasil diperbarui.",
      vehicle: {
        vehicle_id: vehicle.vehicle_id,
        current_odometer: vehicle.current_odometer,
        last_odometer_update: vehicle.last_odometer_update,
      },
    });
  } catch (error) {
    if (t && !t.finished && !t.isRolledBack) {
      await t.rollback();
      console.log('[VEHICLE_ODO_UPDATE_ERROR] Transaction rolled back.');
    }
    console.error("[VEHICLE_ODO_UPDATE_ERROR] Error updating odometer manually:", error);
    res.status(500).json({ message: "Gagal memperbarui odometer.", error: error.message });
  }
});

router.get("/:vehicleId/schedules", authMiddleware, async (req, res) => {
  try {
    const requestedVehicleId = parseInt(req.params.vehicleId, 10);
    const userIdFromToken = req.user.id;
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: requestedVehicleId, user_id: userIdFromToken },
    });
    if (!vehicle) {
      return res.status(404).json({ message: "Kendaraan tidak ditemukan atau Anda tidak diizinkan mengaksesnya." });
    }

    const schedules = await MaintenanceSchedule.findAll({
      where: {
        vehicle_id: requestedVehicleId,
        status: { [Op.or]: ["PENDING", "UPCOMING", "OVERDUE"] },
      },
      order: [
        sequelize.literal("CASE status WHEN 'OVERDUE' THEN 1 WHEN 'UPCOMING' THEN 2 WHEN 'PENDING' THEN 3 ELSE 4 END"),
        [sequelize.fn("COALESCE", sequelize.col("next_due_odometer"), 9999999), "ASC"], // Urutkan null di akhir
        ["next_due_odometer", "ASC"],
        [sequelize.fn("COALESCE", sequelize.col("next_due_date"), '9999-12-31'), "ASC"], // Urutkan null di akhir
        ["next_due_date", "ASC"],
      ],
    });
    res.json(schedules.map(s => s.toJSON()));
  } catch (error) {
    console.error("[SCHEDULE_LIST_ERROR]", error);
    res.status(500).json({ message: "Error server saat mengambil jadwal perawatan.", error: error.message });
  }
});

router.put("/:vehicleId/maintenance-schedules/:scheduleId", authMiddleware, async (req, res) => {
  const { vehicleId, scheduleId } = req.params;
  const userId = req.user.id;
  const {
    status,
    service_date,
    odometer_at_service,
    description,
    workshop_name,
    cost,
    item_name,
    next_due_date,
    next_due_odometer,
  } = req.body;

  console.log(`[SCHEDULE_UPDATE_REQUEST] VehicleID: ${vehicleId}, ScheduleID: ${scheduleId}, Body:`, req.body);

  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findOne({
      where: { vehicle_id: parseInt(vehicleId, 10), user_id: userId },
      transaction: t,
    });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ message: "Kendaraan tidak ditemukan atau Anda tidak memiliki akses." });
    }

    const schedule = await MaintenanceSchedule.findOne({
      where: { schedule_id: parseInt(scheduleId, 10), vehicle_id: parseInt(vehicleId, 10) },
      transaction: t,
    });
    if (!schedule) {
      await t.rollback();
      return res.status(404).json({ message: "Jadwal perawatan tidak ditemukan." });
    }
    console.log(`[SCHEDULE_UPDATE] Found schedule to update: ID=${schedule.schedule_id}, Item=${schedule.item_name}, OldStatus=${schedule.status}`);

    let serviceHistoryEntry = null;

    if (item_name !== undefined) schedule.item_name = item_name;
    if (req.body.schedule_description !== undefined) {
        schedule.description = req.body.schedule_description;
    } else if (status !== "COMPLETED" && req.body.description !== undefined) {
        schedule.description = req.body.description;
    }


    if (status) { 
      schedule.status = status;

      if (status === "COMPLETED") {
        console.log('[SCHEDULE_UPDATE] Processing COMPLETED status...');
        if (!service_date || odometer_at_service === undefined || odometer_at_service === null) {
          await t.rollback();
          return res.status(400).json({ message: "Untuk menyelesaikan servis, 'service_date' dan 'odometer_at_service' wajib diisi." });
        }
        if (isNaN(parseFloat(odometer_at_service))) {
          await t.rollback();
          return res.status(400).json({ message: "Nilai 'odometer_at_service' harus berupa angka." });
        }
        if (cost && isNaN(parseFloat(cost))) {
          await t.rollback();
          return res.status(400).json({ message: "Nilai 'cost' harus berupa angka." });
        }

        console.log(`[SCHEDULE_UPDATE] Creating ServiceHistory for: ${schedule.item_name}`);
        serviceHistoryEntry = await ServiceHistory.create({
          vehicle_id: parseInt(vehicleId, 10),
          service_date: service_date,
          odometer_at_service: parseFloat(odometer_at_service),
          service_type: schedule.item_name,
          description: description || schedule.description,
          workshop_name: workshop_name || null,
          cost: cost ? parseFloat(cost) : null,
        }, { transaction: t });
        console.log('[SCHEDULE_UPDATE] ServiceHistory created:', serviceHistoryEntry.history_id);

        const odoAtServiceNum = parseFloat(odometer_at_service);
        if (odoAtServiceNum > (parseFloat(vehicle.current_odometer) || 0)) {
          vehicle.current_odometer = odoAtServiceNum;
        }
        if (!vehicle.last_service_date || new Date(service_date) > new Date(vehicle.last_service_date)) {
          vehicle.last_service_date = service_date;
        }
        vehicle.last_odometer_update = new Date();
        await vehicle.save({ transaction: t });
        console.log('[SCHEDULE_UPDATE] Vehicle data updated after service completion.');

        schedule.next_due_date = null;
        schedule.next_due_odometer = null;
      } else if (status === "SKIPPED") {
        console.log('[SCHEDULE_UPDATE] Processing SKIPPED status...');
        schedule.next_due_date = null;
        schedule.next_due_odometer = null;
      } else if (["PENDING", "UPCOMING", "OVERDUE"].includes(status)) {
        console.log(`[SCHEDULE_UPDATE] Processing manual status update to: ${status}`);
        if (next_due_date !== undefined) schedule.next_due_date = next_due_date;
        if (next_due_odometer !== undefined) schedule.next_due_odometer = next_due_odometer;
      }
    } else {
      if (next_due_date !== undefined) schedule.next_due_date = next_due_date;
      if (next_due_odometer !== undefined) schedule.next_due_odometer = next_due_odometer;
    }

    console.log(`[SCHEDULE_UPDATE] Attempting to save schedule ID ${schedule.schedule_id} with status ${schedule.status} and odo ${schedule.next_due_odometer}`);
    await schedule.save({ transaction: t });
    console.log(`[SCHEDULE_UPDATE] Schedule ID ${schedule.schedule_id} saved. Committing transaction...`);
    
    await t.commit();
    console.log('[SCHEDULE_UPDATE] Transaction committed.');

    console.log(`[SCHEDULE_UPDATE_SCHEDULER_TRIGGER] Triggering scheduler for vehicle ID ${vehicle.vehicle_id} (status: ${schedule.status})`);
    checkAndGenerateSchedulesAndNotifications(parseInt(vehicle.vehicle_id, 10)).catch(err => {
      console.error(`[SCHEDULE_UPDATE_SCHEDULER_ERROR] Error calling scheduler for vehicle ${vehicle.vehicle_id} after schedule update:`, err);
    });
    
    res.json({
      message: "Jadwal perawatan berhasil diperbarui.",
      schedule: schedule.toJSON(),
      serviceHistory: serviceHistoryEntry ? serviceHistoryEntry.toJSON() : null,
    });

  } catch (error) {
    if (t && !t.finished && !t.isRolledBack) {
      try {
        await t.rollback();
        console.log('[SCHEDULE_UPDATE_ERROR] Transaction rolled back due to error.');
      } catch (rollbackError) {
        console.error('[SCHEDULE_UPDATE_ERROR] Error during rollback:', rollbackError);
      }
    }
    console.error(`[SCHEDULE_UPDATE_ERROR] Error updating maintenance schedule (ID: ${scheduleId}):`, error);
    res.status(500).json({
      message: "Gagal memperbarui jadwal perawatan.",
      error: error.message,
      details: error.parent ? error.parent.sqlMessage : null
    });
  }
});


router.post('/:vehicleId/trips', authMiddleware, async (req, res) => {
  const { vehicleId } = req.params;
  const userId = req.user.id;
  const {
    distance_km,
    start_time,
    end_time,
    start_latitude,
    start_longitude,
    end_latitude,
    end_longitude
  } = req.body;

  console.log(`[TRIP_ADD_REQUEST] Vehicle ID: ${vehicleId}, Data:`, req.body);

  if (distance_km === undefined || parseFloat(distance_km) <= 0) {
    return res.status(400).json({ message: 'Jarak tempuh (distance_km) wajib diisi dan lebih dari 0.' });
  }
  if (isNaN(parseFloat(distance_km))) {
    return res.status(400).json({ message: 'Jarak tempuh (distance_km) harus berupa angka.' });
  }


  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findOne({ where: { vehicle_id: parseInt(vehicleId, 10), user_id: userId }, transaction: t });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau bukan milik Anda.' });
    }

    let resolvedStartAddress = null;
    let resolvedEndAddress = null;

    if (start_latitude && start_longitude) {
      resolvedStartAddress = await getAddressFromCoordinates(parseFloat(start_latitude), parseFloat(start_longitude));
    }
    if (end_latitude && end_longitude) {
      resolvedEndAddress = await getAddressFromCoordinates(parseFloat(end_latitude), parseFloat(end_longitude));
    }

    const newTrip = await Trip.create({
      vehicle_id: parseInt(vehicleId, 10),
      distance_km: parseFloat(distance_km),
      start_time: start_time ? new Date(start_time) : null,
      end_time: end_time ? new Date(end_time) : new Date(),
      start_latitude: start_latitude ? parseFloat(start_latitude) : null,
      start_longitude: start_longitude ? parseFloat(start_longitude) : null,
      end_latitude: end_latitude ? parseFloat(end_latitude) : null,
      end_longitude: end_longitude ? parseFloat(end_longitude) : null,
      start_address: resolvedStartAddress,
      end_address: resolvedEndAddress,
    }, { transaction: t });
    console.log(`[TRIP_ADD_SUCCESS] Trip created, ID: ${newTrip.trip_id}`);

    const currentOdo = parseInt(vehicle.current_odometer, 10) || 0;
    const newOdometer = currentOdo + Math.round(parseFloat(distance_km));
    vehicle.current_odometer = newOdometer;
    vehicle.last_odometer_update = new Date();
    await vehicle.save({ transaction: t });
    console.log(`[TRIP_ADD_SUCCESS] Vehicle ${vehicleId} odometer updated to ${newOdometer}.`);

    await t.commit();
    console.log('[TRIP_ADD_SUCCESS] Transaction committed.');

    console.log(`[TRIP_ADD_SCHEDULER_TRIGGER] Triggering scheduler for vehicle ${vehicleId}`);
    checkAndGenerateSchedulesAndNotifications(parseInt(vehicleId, 10)).catch(err => {
      console.error("[TRIP_ADD_SCHEDULER_ERROR] Error triggering scheduler:", err);
    });

    res.status(201).json({
      message: 'Perjalanan berhasil dicatat.',
      newOdometer: vehicle.current_odometer,
      trip: newTrip.toJSON(),
    });

  } catch (error) {
    if (t && !t.finished && !t.isRolledBack) {
        await t.rollback();
        console.log('[TRIP_ADD_ERROR] Transaction rolled back.');
    }
    console.error('[TRIP_ADD_ERROR] Error recording trip:', error);
    res.status(500).json({ message: 'Gagal mencatat perjalanan.', error: error.message, details: error.parent ? error.parent.sqlMessage : null });
  }
});

router.get('/:vehicleId/all-trips', authMiddleware, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.id;

    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'end_time';
    const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const vehicle = await Vehicle.findOne({
      where: {
        vehicle_id: vehicleId,
        user_id: userId,
      },
    });

    if (!vehicle) {
      return res.status(404).json({ message: 'Kendaraan tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    const trips = await Trip.findAll({
      where: { vehicle_id: vehicleId },
      limit: limit,
      order: [
        [sortBy, sortOrder]
      ],
    });

    res.status(200).json({ trips });

  } catch (error) {
    console.error('[GET_ALL_TRIPS_ERROR] Gagal mendapatkan data perjalanan:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server saat mengambil data perjalanan.' });
  }
});

module.exports = router;
