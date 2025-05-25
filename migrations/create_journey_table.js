module.exports = {
    up: async (queryInterface, Sequelize) => {
      await queryInterface.createTable('journeys', {
        id_perjalanan: {
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
        tanggal_perjalanan: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        jarak_tempuh: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        lokasi_awal: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        lokasi_akhir: {
          type: Sequelize.STRING,
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
      await queryInterface.dropTable('journeys');
    },
  };
  