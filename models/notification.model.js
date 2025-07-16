const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Notification = sequelize.define('Notification', {
  notification_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  vehicle_id: { type: DataTypes.INTEGER },
  schedule_id: { type: DataTypes.INTEGER },
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('SERVICE_REMINDER', 'OVERDUE_ALERT', 'PROMOTION', 'INFO'), defaultValue: 'INFO' },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
  }
}, { tableName: 'notifications', timestamps: true, underscored: true });
module.exports = Notification;