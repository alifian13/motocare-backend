module.exports = {
    up: async (queryInterface, Sequelize) => {
      await queryInterface.createTable('notifications', {
        id_notifikasi: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        id_service: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'services',
            key: 'id_service',
          },
        },
        pesan: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        tanggal_terkirim: {
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
      await queryInterface.dropTable('notifications');
    },
  };
  