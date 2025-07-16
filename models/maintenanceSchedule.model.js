const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaintenanceSchedule = sequelize.define('MaintenanceSchedule', {
  schedule_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vehicle_id: { type: DataTypes.INTEGER, allowNull: false },
  item_name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  next_due_date: { type: DataTypes.DATEONLY },
  next_due_odometer: { type: DataTypes.INTEGER },
  status: { type: DataTypes.ENUM('PENDING', 'UPCOMING', 'OVERDUE', 'COMPLETED', 'SKIPPED'), defaultValue: 'PENDING' },
}, { tableName: 'maintenance_schedules', timestamps: true, underscored: true });
module.exports = MaintenanceSchedule;