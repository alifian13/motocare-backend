// models/vehicle.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Mengacu pada file database.js Anda
// const User = require('./user.model'); // Akan digunakan untuk asosiasi

const Vehicle = sequelize.define('Vehicle', {
  vehicle_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: { // Foreign key
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  plate_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    // unique: true,
  },
  brand: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  current_odometer: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_odometer_update: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_service_date: {
    type: DataTypes.DATEONLY, // Hanya tanggal, tanpa waktu
    allowNull: true,
  },
  photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  logo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'vehicles',
  timestamps: true,
  underscored: true,
  indexes: [ // <-- TAMBAHKAN BLOK INI
    {
      unique: true,
      fields: ['plate_number'],
      name: 'vehicles_plate_number_unique_constraint' // Nama constraint yang konsisten
    }
  ]
});

module.exports = Vehicle;