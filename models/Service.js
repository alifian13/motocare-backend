const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../utils/database");
const Motor = require("./motor");

const Service = sequelize.define(
  "Service",
  {
    id_service: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    plat_nomor: {
      type: DataTypes.STRING,
      references: {
        model: Motor,
        key: "plat_nomor",
      },
    },
    jenis_service: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kilometer_service: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "services",
    timestamps: true,
  }
);

Service.insert_data = async function (data) {
  await this.create(data);
};

Service.update_data = async function (data, id_service) {
  await this.update(data, {
    where: { id_service },
  });
};

module.exports = Service;
