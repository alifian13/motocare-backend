// utils/maintenanceScheduler.js
const { Op } = require('sequelize');
const { Vehicle, ServiceHistory, MaintenanceSchedule, Notification, ServiceRule, sequelize } = require('../models');

async function checkAndGenerateSchedulesAndNotifications(vehicleId, options = {}) {
  const t = options.transaction || (await sequelize.transaction());
  const isOuterTransaction = !options.transaction;

  console.log(`[SCHEDULER_MAIN] Starting check for vehicleId: ${vehicleId} with transaction ID: ${t.id || 'new_by_scheduler'}`);

  try {
    const vehicle = await Vehicle.findByPk(vehicleId, { transaction: t });
    if (!vehicle) {
      console.error(`[SCHEDULER_MAIN] Vehicle ${vehicleId} not found.`);
      if (isOuterTransaction) await t.rollback();
      return;
    }
    const currentOdometer = parseFloat(vehicle.current_odometer) || 0;
    console.log(`[SCHEDULER_MAIN] Vehicle ${vehicleId} Data: currentOdometer = ${currentOdometer}, FullData:`, JSON.stringify(vehicle.toJSON(), null, 2));

    const serviceRules = await ServiceRule.findAll({ transaction: t });
    if (!serviceRules || serviceRules.length === 0) {
      console.warn(`[SCHEDULER_MAIN] No service rules found in database for vehicle ${vehicleId}.`);
      if (isOuterTransaction) await t.commit();
      return;
    }
    console.log(`[SCHEDULER_MAIN] Found ${serviceRules.length} service rules.`);

    for (const rule of serviceRules) {
      const ruleNameForLog = rule.service_name;
      const isDetailedLogActive = ruleNameForLog.toLowerCase().includes('oli') || ruleNameForLog.toLowerCase().includes('cvt'); // Aktifkan log detail untuk oli dan CVT

      if (isDetailedLogActive) {
        console.log(`\n[SCHEDULER_RULE] === Processing Rule: "${ruleNameForLog}" for Vehicle ID: ${vehicleId} ===`);
        console.log(`[SCHEDULER_RULE] Rule Details: ID=${rule.rule_id}, IntervalKM=${rule.interval_km}, WarnThresholdKM=${rule.warning_threshold_km}`);
        console.log(`[SCHEDULER_RULE] Current Odometer (vehicle): ${currentOdometer}`);
      }

      const lastService = await ServiceHistory.findOne({
        where: { vehicle_id: vehicleId, service_type: rule.service_name },
        order: [['service_date', 'DESC'], ['odometer_at_service', 'DESC']],
        transaction: t,
      });

      if (isDetailedLogActive) {
        console.log(`[SCHEDULER_RULE] Last Service for "${ruleNameForLog}":`, lastService ? JSON.stringify(lastService.toJSON(), null, 2) : 'No previous service history for this type.');
      }

      const lastServiceOdometer = lastService ? (parseFloat(lastService.odometer_at_service) || 0) : 0;
      if (isDetailedLogActive) {
        console.log(`[SCHEDULER_RULE] Last Service Odometer Used for "${ruleNameForLog}": ${lastServiceOdometer}`);
      }

      const nextServiceOdometerTarget = lastServiceOdometer + rule.interval_km;
      if (isDetailedLogActive) {
        console.log(`[SCHEDULER_RULE] Calculated Next Due Odometer Target for "${ruleNameForLog}": ${nextServiceOdometerTarget} (last: ${lastServiceOdometer} + interval: ${rule.interval_km})`);
      }

      let [schedule, created] = await MaintenanceSchedule.findOrCreate({
        where: {
          vehicle_id: vehicleId,
          item_name: rule.service_name,
        },
        defaults: {
          vehicle_id: vehicleId,
          item_name: rule.service_name,
          description: rule.description || `Perawatan rutin untuk ${rule.service_name}`,
          next_due_odometer: nextServiceOdometerTarget,
          status: 'PENDING',
          recommended_interval_km: rule.interval_km,
        },
        transaction: t
      });

      if (isDetailedLogActive) {
        console.log(`[SCHEDULER_RULE] Schedule findOrCreate for "${ruleNameForLog}": Created = ${created}. Schedule ID = ${schedule.schedule_id}.`);
        console.log(`[SCHEDULER_RULE] Initial/Found Schedule Data: Odo=${schedule.next_due_odometer}, Status=${schedule.status}`);
      }
      
      const oldOdometerInSchedule = schedule.next_due_odometer;
      const oldStatusInSchedule = schedule.status;
      const oldDescriptionInSchedule = schedule.description;
      const oldRecommendedIntervalInSchedule = schedule.recommended_interval_km;


      schedule.next_due_odometer = nextServiceOdometerTarget;
      schedule.description = rule.description || `Perawatan rutin untuk ${rule.service_name}`;
      schedule.recommended_interval_km = rule.interval_km;

      let newCalculatedStatus;
      if (currentOdometer >= schedule.next_due_odometer) {
        newCalculatedStatus = 'OVERDUE';
      } else if (schedule.next_due_odometer > currentOdometer &&
                 (schedule.next_due_odometer - currentOdometer) <= (parseInt(rule.warning_threshold_km, 10) || 100)) {
        newCalculatedStatus = 'UPCOMING';
      } else {
        newCalculatedStatus = 'PENDING';
      }
      schedule.status = newCalculatedStatus;

      if (isDetailedLogActive || created || oldStatusInSchedule !== schedule.status || oldOdometerInSchedule !== schedule.next_due_odometer) {
          console.log(`[SCHEDULER_RULE_UPDATE] For "${ruleNameForLog}", Schedule ID: ${schedule.schedule_id}`);
          console.log(`  => VehicleOdo: ${currentOdometer}, TargetOdo: ${schedule.next_due_odometer}, WarnThreshold: ${rule.warning_threshold_km || 100}`);
          console.log(`  => OldStatus: ${oldStatusInSchedule}, OldOdo: ${oldOdometerInSchedule}, NewCalculatedStatus: ${schedule.status}, IsNewSchedule: ${created}`);
      }
      
      if (created || 
          oldOdometerInSchedule !== schedule.next_due_odometer || 
          oldStatusInSchedule !== schedule.status ||
          oldDescriptionInSchedule !== schedule.description ||
          oldRecommendedIntervalInSchedule !== schedule.recommended_interval_km
          ) {
        try {
          console.log(`[SCHEDULER_RULE_SAVE] Attempting to SAVE schedule for "${ruleNameForLog}": ID=${schedule.schedule_id}, NewOdo=${schedule.next_due_odometer}, NewStatus=${schedule.status}`);
          await schedule.save({ transaction: t });
          console.log(`[SCHEDULER_RULE_SAVE] Schedule SAVE successful for "${ruleNameForLog}": ID=${schedule.schedule_id}. Final Status: ${schedule.status}, Final Odo: ${schedule.next_due_odometer}`);
        } catch (saveError) {
          console.error(`[SCHEDULER_RULE_SAVE] ERROR SAVING schedule for "${ruleNameForLog}", ID: ${schedule.schedule_id}`, saveError);
          if (isOuterTransaction) { // Hanya rollback jika transaksi ini milik scheduler
            await t.rollback();
            console.log(`[SCHEDULER_MAIN] Transaction rolled back for vehicleId: ${vehicleId} due to schedule save error.`);
          }
          throw saveError; // Lempar error untuk menghentikan proses untuk vehicle ini dan memberi tahu pemanggil jika ada
        }
      } else {
        if (isDetailedLogActive) {
            console.log(`[SCHEDULER_RULE_SAVE] No relevant changes to save for schedule "${ruleNameForLog}", ID: ${schedule.schedule_id}. Status=${schedule.status}, Odo=${schedule.next_due_odometer}`);
        }
      }

      // --- Logika Notifikasi ---
      if (schedule.status === 'PENDING') {
        const [updatedCount] = await Notification.update(
          { is_read: true },
          {
            where: {
              schedule_id: schedule.schedule_id,
              user_id: vehicle.user_id,
              is_read: false,
              type: { [Op.or]: ['OVERDUE_ALERT', 'SERVICE_REMINDER'] }
            },
            transaction: t
          }
        );
        if (updatedCount > 0 && isDetailedLogActive) {
          console.log(`[SCHEDULER_NOTIF] Marked ${updatedCount} old notifications as read for schedule "${ruleNameForLog}", ID: ${schedule.schedule_id}`);
        }
      } else if (schedule.status === 'OVERDUE' || schedule.status === 'UPCOMING') {
        const notificationType = schedule.status === 'OVERDUE' ? 'OVERDUE_ALERT' : 'SERVICE_REMINDER';
        const notificationTitle = schedule.status === 'OVERDUE' ? `TERLEWAT: ${schedule.item_name}` : `SEGERA: ${schedule.item_name}`;
        let notificationMessage;
        if (schedule.status === 'OVERDUE') {
            const overdueKm = currentOdometer - schedule.next_due_odometer;
            notificationMessage = `Motor Anda (${vehicle.brand} ${vehicle.model}) telah melewati jadwal ${schedule.item_name} sekitar ${overdueKm} km lalu (Target: ${schedule.next_due_odometer} km). Segera lakukan perawatan!`;
        } else { // UPCOMING
            const remainingKm = schedule.next_due_odometer - currentOdometer;
            notificationMessage = `Motor Anda (${vehicle.brand} ${vehicle.model}) mendekati jadwal ${schedule.item_name} (kurang ${remainingKm} km lagi, Target: ${schedule.next_due_odometer} km). Persiapkan perawatan.`;
        }

        const existingUnreadNotification = await Notification.findOne({
          where: {
            schedule_id: schedule.schedule_id,
            user_id: vehicle.user_id,
            type: notificationType,
            is_read: false
          },
          transaction: t
        });

        if (!existingUnreadNotification) {
          await Notification.create({
            user_id: vehicle.user_id,
            vehicle_id: vehicleId,
            schedule_id: schedule.schedule_id,
            title: notificationTitle,
            message: notificationMessage,
            type: notificationType,
          }, { transaction: t });
          if (isDetailedLogActive) {
            console.log(`[SCHEDULER_NOTIF] Created new ${notificationType} notification for schedule "${ruleNameForLog}", ID: ${schedule.schedule_id}`);
          }
        } else {
          if (isDetailedLogActive) {
            console.log(`[SCHEDULER_NOTIF] Existing unread ${notificationType} notification found for schedule "${ruleNameForLog}", ID: ${schedule.schedule_id}. No new notification created.`);
          }
        }
      }
      if (isDetailedLogActive) {
        console.log(`[SCHEDULER_RULE] === End Processing Rule: "${ruleNameForLog}" ===\n`);
      }
    } // Akhir loop for (const rule of serviceRules)

    if (isOuterTransaction) {
      await t.commit();
      console.log(`[SCHEDULER_MAIN] Transaction committed for vehicleId: ${vehicleId}`);
    } else {
      console.log(`[SCHEDULER_MAIN] Using existing transaction for vehicleId: ${vehicleId}. Commit will be handled by caller.`);
    }

  } catch (error) {
    console.error(`[SCHEDULER_MAIN] CRITICAL ERROR processing schedules for vehicleId ${vehicleId}:`, error);
    if (t && !t.finished && isOuterTransaction) {
      try {
        await t.rollback();
        console.log(`[SCHEDULER_MAIN] Transaction rolled back for vehicleId: ${vehicleId} due to critical error.`);
      } catch (rollbackError) {
        console.error(`[SCHEDULER_MAIN] Error during rollback for vehicleId ${vehicleId}:`, rollbackError);
      }
    } else if (t && !t.finished && !isOuterTransaction) {
      console.log(`[SCHEDULER_MAIN] Error with existing transaction for vehicleId: ${vehicleId}. Rollback should be handled by caller.`);
    }
    // Jika transaksi dibuat oleh fungsi ini, kita sudah rollback, jadi tidak perlu throw lagi kecuali ingin di-handle di level lebih atas.
    // Jika transaksi dari luar, lempar error agar pemanggil bisa rollback.
    if (!isOuterTransaction && error) throw error; 
  }
}

async function generateInitialSchedules(vehicleId) {
    console.log(`[SCHEDULER_INIT] Generating initial schedules for new vehicleId: ${vehicleId}`);
    await checkAndGenerateSchedulesAndNotifications(vehicleId);
}

module.exports = { checkAndGenerateSchedulesAndNotifications, generateInitialSchedules };
