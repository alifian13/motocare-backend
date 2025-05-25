// models/trip.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Sesuaikan path jika file database.js Anda ada di root

const Trip = sequelize.define('Trip', {
  trip_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  vehicle_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  distance_km: {
    type: DataTypes.DECIMAL(10, 2), // Misal 10 digit total, 2 di belakang koma
    allowNull: false,
  },
  start_time: {
    type: DataTypes.DATE, // Sequelize akan menangani konversi ke TIMESTAMP/DATETIME di DB
    allowNull: true,
  },
  end_time: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  start_latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  start_longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  end_latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  end_longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  start_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  end_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // createdAt dan updatedAt akan dikelola oleh Sequelize jika timestamps: true
}, {
  tableName: 'trips',
  timestamps: true, // Aktifkan createdAt dan updatedAt
  underscored: true, // Gunakan snake_case untuk kolom default Sequelize (created_at, updated_at)
});

module.exports = Trip;