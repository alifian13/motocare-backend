const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ServiceRule = sequelize.define('ServiceRule', {
  rule_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  service_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  interval_km: { type: DataTypes.INTEGER, allowNull: false },
  warning_threshold_km: { type: DataTypes.INTEGER, defaultValue: 100 },
  description: { type: DataTypes.TEXT },
}, {
  tableName: 'service_rules',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['service_name'],
      name: 'service_rules_service_name_unique_constraint' // Nama constraint yang konsisten
    }
  ]
});

module.exports = ServiceRule;