const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

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
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  start_time: {
    type: DataTypes.DATE,
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
}, {
  tableName: 'trips',
  timestamps: true,
  underscored: true,
});

module.exports = Trip;