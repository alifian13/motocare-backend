// utils/maintenanceScheduler.js
// Pastikan path ke ../models sudah benar dan models/index.js mengekspor semua model ini
const { Vehicle, ServiceHistory, MaintenanceSchedule, Notification, ServiceRule, sequelize } = require('../models');

async function checkAndGenerateSchedulesAndNotifications(vehicleId) {
  console.log(`[Scheduler] Checking schedules for vehicleId: ${vehicleId}`);
  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findByPk(vehicleId, { transaction: t });
    if (!vehicle) {
      console.log(`[Scheduler] Vehicle ${vehicleId} not found.`);
      await t.rollback();
      return;
    }

    const currentOdometer = parseFloat(vehicle.current_odometer) || 0;
    const serviceRules = await ServiceRule.findAll({ transaction: t });

    for (const rule of serviceRules) {
      const lastService = await ServiceHistory.findOne({
        where: { vehicle_id: vehicleId, service_type: rule.service_name },
        order: [['odometer_at_service', 'DESC']],
        transaction: t,
      });

      const lastServiceOdometer = lastService ? (parseFloat(lastService.odometer_at_service) || 0) : 0;
      const nextServiceOdometerTarget = lastServiceOdometer + rule.interval_km;

      console.log(`[Scheduler] Rule: ${rule.service_name}, LastOdo: ${lastServiceOdometer}, Interval: ${rule.interval_km}, Target: ${nextServiceOdometerTarget}, Current: ${currentOdometer}`);

      // Hapus atau update jadwal PENDING/UPCOMING yang mungkin sudah tidak relevan jika ada servis manual
      // Ini bisa menjadi lebih kompleks, untuk saat ini kita fokus pada pembuatan jadwal baru jika diperlukan

      const existingRelevantSchedule = await MaintenanceSchedule.findOne({
        where: {
          vehicle_id: vehicleId,
          item_name: rule.service_name,
          status: ['PENDING', 'UPCOMING', 'OVERDUE'] // Cari yang belum selesai
        },
        order: [['next_due_odometer', 'ASC']], // Ambil yang paling dekat targetnya
        transaction: t,
      });


      if (currentOdometer >= nextServiceOdometerTarget) { // OVERDUE
        if (!existingRelevantSchedule || (existingRelevantSchedule && existingRelevantSchedule.status !== 'OVERDUE') || (existingRelevantSchedule && existingRelevantSchedule.next_due_odometer < nextServiceOdometerTarget) ) {
          // Buat atau update ke OVERDUE jika tidak ada, atau jika yang ada belum OVERDUE, atau jika target odo yang ada lebih rendah
          const [schedule, created] = await MaintenanceSchedule.findOrCreate({
            where: { vehicle_id: vehicleId, item_name: rule.service_name, status: 'OVERDUE' }, // Spesifik OVERDUE untuk findOrCreate
            defaults: {
              vehicle_id: vehicleId, item_name: rule.service_name,
              description: rule.description || `Perawatan rutin untuk ${rule.service_name}`,
              next_due_odometer: nextServiceOdometerTarget, status: 'OVERDUE',
              recommended_interval_km: rule.interval_km,
            },
            transaction: t
          });
          if (!created) { // Jika ditemukan, update targetnya jika berbeda
            schedule.next_due_odometer = nextServiceOdometerTarget;
            schedule.description = rule.description || `Perawatan rutin untuk ${rule.service_name}`;
            await schedule.save({ transaction: t });
          }
          console.log(`[Scheduler] OVERDUE: ${rule.service_name} for vehicle ${vehicleId} at ${nextServiceOdometerTarget} km.`);

          // Buat Notifikasi OVERDUE (hanya jika baru menjadi overdue atau belum ada notif aktif)
          const existingNotification = await Notification.findOne({
            where: { vehicle_id: vehicleId, schedule_id: schedule.schedule_id, type: 'OVERDUE_ALERT', is_read: false }, // Cek notif aktif
            transaction: t
          });
          if (!existingNotification) {
            await Notification.create({
              user_id: vehicle.user_id, vehicle_id: vehicleId, schedule_id: schedule.schedule_id,
              title: `TERLEWAT: ${rule.service_name}`,
              message: `Motor Anda (${vehicle.brand} ${vehicle.model}) telah melewati jadwal ${rule.service_name} pada ${nextServiceOdometerTarget} km. Segera lakukan perawatan!`,
              type: 'OVERDUE_ALERT',
            }, { transaction: t });
          }
        }
      } else if (nextServiceOdometerTarget - currentOdometer <= rule.warning_threshold_km) { // UPCOMING
        if (!existingRelevantSchedule || (existingRelevantSchedule && existingRelevantSchedule.status !== 'UPCOMING') || (existingRelevantSchedule && existingRelevantSchedule.next_due_odometer < nextServiceOdometerTarget) ) {
          const [schedule, created] = await MaintenanceSchedule.findOrCreate({
            where: { vehicle_id: vehicleId, item_name: rule.service_name, status: 'UPCOMING' },
             defaults: {
              vehicle_id: vehicleId, item_name: rule.service_name,
              description: rule.description || `Perawatan rutin untuk ${rule.service_name}`,
              next_due_odometer: nextServiceOdometerTarget, status: 'UPCOMING',
              recommended_interval_km: rule.interval_km,
            },
            transaction: t
          });
          if (!created) {
            schedule.next_due_odometer = nextServiceOdometerTarget;
            schedule.description = rule.description || `Perawatan rutin untuk ${rule.service_name}`;
            await schedule.save({ transaction: t });
          }
          console.log(`[Scheduler] UPCOMING: ${rule.service_name} for vehicle ${vehicleId} at ${nextServiceOdometerTarget} km.`);
          // Opsional: Buat notifikasi "SERVICE_REMINDER" di sini
        }
      } else { // PENDING
         if (!existingRelevantSchedule || (existingRelevantSchedule && existingRelevantSchedule.status !== 'PENDING') || (existingRelevantSchedule && existingRelevantSchedule.next_due_odometer < nextServiceOdometerTarget)) {
            const [schedule, created] = await MaintenanceSchedule.findOrCreate({
                where: { vehicle_id: vehicleId, item_name: rule.service_name, status: 'PENDING' },
                defaults: {
                    vehicle_id: vehicleId, item_name: rule.service_name,
                    description: rule.description || `Perawatan rutin untuk ${rule.service_name}`,
                    next_due_odometer: nextServiceOdometerTarget, status: 'PENDING',
                    recommended_interval_km: rule.interval_km,
                },
                transaction: t
            });
             if (!created) {
                schedule.next_due_odometer = nextServiceOdometerTarget;
                schedule.description = rule.description || `Perawatan rutin untuk ${rule.service_name}`;
                await schedule.save({ transaction: t });
            }
            console.log(`[Scheduler] PENDING: ${rule.service_name} for vehicle ${vehicleId} at ${nextServiceOdometerTarget} km.`);
        }
      }
    }
    await t.commit();
    console.log(`[Scheduler] Finished checking schedules for vehicleId: ${vehicleId}`);
  } catch (error) {
    if (t && !t.finished) await t.rollback(); // Pastikan rollback jika transaksi belum selesai
    console.error(`[Scheduler] Error for vehicleId ${vehicleId}:`, error);
  }
}

async function generateInitialSchedules(vehicleId) {
    console.log(`[Scheduler] Generating initial schedules for new vehicleId: ${vehicleId}`);
    // Panggil fungsi utama dengan ID kendaraan yang baru dibuat
    await checkAndGenerateSchedulesAndNotifications(vehicleId);
}

module.exports = { checkAndGenerateSchedulesAndNotifications, generateInitialSchedules };