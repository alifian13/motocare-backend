// models/maintenanceSchedule.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceSchedule = sequelize.define('MaintenanceSchedule', {
  schedule_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vehicle_id: { type: DataTypes.INTEGER, allowNull: false },
  item_name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  // ... field lain dari skema DB Anda (recommended_interval_km, next_due_date, status, dll.)
  // Pastikan tipe data cocok (DATEONLY untuk tanggal, ENUM untuk status)
  next_due_date: { type: DataTypes.DATEONLY },
  next_due_odometer: { type: DataTypes.INTEGER },
  status: { type: DataTypes.ENUM('PENDING', 'UPCOMING', 'OVERDUE', 'COMPLETED', 'SKIPPED'), defaultValue: 'PENDING' },
}, { tableName: 'maintenance_schedules', timestamps: true, underscored: true });
module.exports = MaintenanceSchedule;