// models/index.js
const sequelize = require('../config/database'); // Atau '../config/database' sesuai struktur Anda

const User = require('./user.model');
const Vehicle = require('./vehicle.model');
const ServiceHistory = require('./serviceHistory.model');
const MaintenanceSchedule = require('./maintenanceSchedule.model');
const ServiceRule = require('./serviceRule.model'); // Pastikan ini ada
const Notification = require('./notification.model');
const Trip = require('./trip.model'); // Model untuk tabel trips

// Definisikan asosiasi
User.hasMany(Vehicle, { foreignKey: 'user_id', as: 'vehicles', onDelete: 'CASCADE' });
Vehicle.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Vehicle.hasMany(ServiceHistory, { foreignKey: 'vehicle_id', as: 'historyEntries', onDelete: 'CASCADE' });
ServiceHistory.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

Vehicle.hasMany(MaintenanceSchedule, { foreignKey: 'vehicle_id', as: 'schedules', onDelete: 'CASCADE' });
MaintenanceSchedule.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

// Asosiasi untuk Notifikasi
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Notification.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'relatedVehicle', allowNull: true, constraints: false });
Notification.belongsTo(MaintenanceSchedule, { foreignKey: 'schedule_id', as: 'relatedSchedule', allowNull: true, constraints: false });

// Asosiasi untuk Trip
Vehicle.hasMany(Trip, { foreignKey: 'vehicle_id', as: 'trips', onDelete: 'CASCADE' });
Trip.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

const db = {
  sequelize,
  Sequelize: require('sequelize'),
  User,
  Vehicle,
  ServiceHistory,
  MaintenanceSchedule,
  ServiceRule,
  Notification,
  Trip,
};

module.exports = db;