// models/notification.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Notification = sequelize.define('Notification', {
  notification_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  vehicle_id: { type: DataTypes.INTEGER }, // Bisa null
  schedule_id: { type: DataTypes.INTEGER }, // Bisa null
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('SERVICE_REMINDER', 'OVERDUE_ALERT', 'PROMOTION', 'INFO'), defaultValue: 'INFO' },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  updatedAt: { // Atau updated_at jika underscored: true
    type: DataTypes.DATE,
    // allowNull: true, // Izinkan null awalnya
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'), // Lebih aman
  }
}, { tableName: 'notifications', timestamps: true, underscored: true });
module.exports = Notification;