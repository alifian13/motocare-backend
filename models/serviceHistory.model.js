// models/serviceHistory.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Sesuaikan path jika perlu

const ServiceHistory = sequelize.define('ServiceHistory', {
  history_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  vehicle_id: { // Foreign key ke tabel vehicles
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_date: {
    type: DataTypes.DATEONLY, // Hanya tanggal
    allowNull: false,
  },
  odometer_at_service: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_type: { // e.g., 'Ganti Oli', 'Servis CVT'
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  workshop_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  }
  // created_at dan updated_at akan diurus oleh Sequelize jika timestamps: true
}, {
  tableName: 'service_history',
  timestamps: true, // Menggunakan created_at dan updated_at dari Sequelize
  underscored: true, // Jika nama kolom di DB Anda created_at, updated_at
});

module.exports = ServiceHistory;