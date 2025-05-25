const sequelize = require("../utils/database");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('motors', {
      plat_nomor: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'users', // foreign key reference to Users table
          key: 'email',
        },
      },
      brand: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      model: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      odometer: {
            type: Sequelize.STRING,
            allowNull: false,
          },
      last_service_date: {
        type: Sequelize.DATE, // Adding last service date column
        allowNull: true, // Can be null initially
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('motors');
  },
};
