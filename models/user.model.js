// models/user.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Mengacu pada file database.js Anda
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    // unique: true,
    validate: {
      isEmail: true,
    },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  photo_url: { // <-- TAMBAHKAN INI
    type: DataTypes.STRING, // URL ke foto profil
    allowNull: true,
  },
  // Timestamps (created_at, updated_at) akan ditambahkan otomatis oleh Sequelize
  // jika Anda tidak mendefinisikannya dan tidak menonaktifkan timestamps.
  // Jika nama kolom di DB Anda adalah created_at dan updated_at, Sequelize akan menanganinya.
  // Atau Anda bisa definisikan secara eksplisit:
  // createdAt: {
  //   type: DataTypes.DATE,
  //   field: 'created_at' // Sesuaikan dengan nama kolom di DB
  // },
  // updatedAt: {
  //   type: DataTypes.DATE,
  //   field: 'updated_at' // Sesuaikan dengan nama kolom di DB
  // }
}, {
  tableName: 'users', // Nama tabel di database Anda
  timestamps: true, // Sequelize akan mengelola created_at dan updated_at
  // Jika nama kolom timestamp Anda berbeda, gunakan underscored: true dan field seperti di atas
  underscored: true, // Otomatis mengubah camelCase menjadi snake_case untuk nama kolom default
  indexes: [ // <-- TAMBAHKAN BLOK INI
    {
      unique: true,
      fields: ['email'],
      name: 'users_email_unique_constraint' // Anda bisa memilih nama ini, pastikan konsisten
    }
  ]
});

// Hook untuk hash password sebelum user disimpan
User.beforeCreate(async (user) => {
  if (user.password_hash) { // Asumsi password mentah dikirim sebagai password_hash sementara
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(user.password_hash, salt);
  }
});

// Metode instance untuk memvalidasi password
User.prototype.isValidPassword = async function(password) {
  return bcrypt.compare(password, this.password_hash);
};

module.exports = User;