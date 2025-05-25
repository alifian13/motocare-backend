module.exports = {
    up: async (queryInterface, Sequelize) => {
      await queryInterface.createTable('services', {
        id_service: {
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
        jenis_service: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        kilometer_service: {
          type: Sequelize.INTEGER,
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
      await queryInterface.dropTable('services');
    },
  };
  