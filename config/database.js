// database.js
const { Sequelize } = require('sequelize');

// Create a new instance of Sequelize for MySQL database connection
const sequelize = new Sequelize('motocare', 'root', '', { // Nama database sudah benar 'motocare'
  host: 'localhost',
  dialect: 'mysql',
  logging: (sql, timing) => {
    // Custom logging function
    console.log(`[SQL] ${sql}`); // Ubah logging agar lebih jelas
    if (timing) {
      console.log(`[Execution time: ${timing}ms]`);
    }
  },
});

module.exports = sequelize;