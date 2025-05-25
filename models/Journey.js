const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../utils/database');

const Journey = sequelize.define('Journey', {
  id_perjalanan: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  plat_nomor: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tanggal_perjalanan: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  jarak_tempuh: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lokasi_awal: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lokasi_akhir: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'journeys',
  timestamps: true,
});

Journey.insert_data = async function (data) {
  await this.create(data);
};

Journey.update_data = async function (data, id_perjalanan) {
  await this.update(data, {
    where: { id_perjalanan }
  });
};

Journey.show_data = async function (plat_nomor) {
  return await this.findAll({
    where: { plat_nomor }
  });
};

module.exports = Journey;
