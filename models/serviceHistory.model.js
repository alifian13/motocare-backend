const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceHistory = sequelize.define('ServiceHistory', {
  history_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  vehicle_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  odometer_at_service: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_type: {
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
}, {
  tableName: 'service_history',
  timestamps: true,
  underscored: true, 
});

module.exports = ServiceHistory;