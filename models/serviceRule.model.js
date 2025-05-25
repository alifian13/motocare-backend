// models/serviceRule.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceRule = sequelize.define('ServiceRule', {
  rule_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  service_name: { type: DataTypes.STRING, allowNull: false, unique: true },
  interval_km: { type: DataTypes.INTEGER, allowNull: false },
  warning_threshold_km: { type: DataTypes.INTEGER, defaultValue: 100 },
  description: { type: DataTypes.TEXT },
}, { tableName: 'service_rules', timestamps: true, underscored: true });

module.exports = ServiceRule;