module.exports = {
    up: async (queryInterface, Sequelize) => {
      await queryInterface.createTable('history_services', {
        id_history_service: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        plat_nomor: {
          type: Sequelize.STRING,
          allowNull: false,
          references: {
            model: 'motors',
            key: 'plat_nomor',
          },
        },
        id_service: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'services',
            key: 'id_service',
          },
        },
        tanggal_service: {
          type: Sequelize.DATE,
          allowNull: false,
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
      await queryInterface.dropTable('history_services');
    },
  };
  