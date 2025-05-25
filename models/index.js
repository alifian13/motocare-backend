// models/index.js
// Pastikan path ke file konfigurasi database Anda benar.
// Jika file database.js Anda ada di root folder backend, pathnya adalah '../database.js'
// Jika ada di dalam folder config, maka '../config/database.js' sudah benar.
const sequelize = require('../config/database'); // ATAU SESUAIKAN PATH KE FILE database.js ANDA

const User = require('./user.model');
const Vehicle = require('./vehicle.model');
const ServiceHistory = require('./serviceHistory.model');
const MaintenanceSchedule = require('./maintenanceSchedule.model'); // **TAMBAHKAN IMPORT INI**
const Notification = require('./notification.model');       // **TAMBAHKAN IMPORT INI**

// Definisikan asosiasi
User.hasMany(Vehicle, { foreignKey: 'user_id', as: 'vehicles' });
Vehicle.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Vehicle.hasMany(ServiceHistory, { foreignKey: 'vehicle_id', as: 'historyEntries' });
ServiceHistory.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

// Asosiasi untuk MaintenanceSchedule
Vehicle.hasMany(MaintenanceSchedule, { foreignKey: 'vehicle_id', as: 'schedules' }); // **TAMBAHKAN INI**
MaintenanceSchedule.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' }); // **TAMBAHKAN INI**

// Asosiasi untuk Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' }); // **TAMBAHKAN INI**
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' }); // **TAMBAHKAN INI**

// Opsional: Jika notifikasi bisa terkait langsung dengan kendaraan atau jadwal
// Notification.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'related_vehicle', constraints: false, allowNull: true });
// Notification.belongsTo(MaintenanceSchedule, { foreignKey: 'schedule_id', as: 'related_schedule', constraints: false, allowNull: true });


const db = {
  sequelize,
  Sequelize: require('sequelize'), // Class Sequelize itu sendiri
  User,
  Vehicle,
  ServiceHistory,
  MaintenanceSchedule, // **PASTIKAN ADA DI SINI**
  Notification,       // **PASTIKAN ADA DI SINI**
};

// Anda bisa memindahkan bagian sinkronisasi ke file server utama (main.js atau index.js)
// agar lebih terkontrol kapan sinkronisasi dijalankan.
// sequelize.sync({ alter: true }) // Hati-hati dengan alter: true di produksi
//   .then(() => console.log('Database & tables synced from models/index.js!'))
//   .catch(err => console.error('Failed to sync database from models/index.js:', err));

module.exports = db;