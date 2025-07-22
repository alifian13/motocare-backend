const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VehicleCoding = sequelize.define('VehicleCoding', {
  coding_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  brand: { type: DataTypes.STRING(100), allowNull: false },
  model: { type: DataTypes.STRING(100), allowNull: false },
  year_start: { type: DataTypes.INTEGER, allowNull: false },
  year_end: { type: DataTypes.INTEGER, allowNull: false },
  vehicle_code: { type: DataTypes.STRING(50), allowNull: false },
}, {
  tableName: 'vehicle_codings',
  timestamps: true,
  underscored: true,
});

module.exports = VehicleCoding;