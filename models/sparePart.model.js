const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SparePart = sequelize.define('SparePart', {
  part_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vehicle_code: { type: DataTypes.STRING(50), allowNull: false },
  service_name: { type: DataTypes.STRING, allowNull: false },
  part_name: { type: DataTypes.STRING, allowNull: false },
  part_code: { type: DataTypes.STRING, allowNull: false },
  purchase_url: { type: DataTypes.TEXT, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'spare_parts',
  timestamps: true,
  underscored: true,
});

module.exports = SparePart;