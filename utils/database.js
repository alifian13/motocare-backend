const { Sequelize } = require('sequelize');

// Create a new instance of Sequelize for MySQL database connection
const sequelize = new Sequelize('motocare_database', 'root', '', {
  host: 'localhost',
  dialect: 'mysql',
  logging: (sql, timing) => {
    // Custom logging function
    console.log(`Executed SQL: ${sql}`);
    if (timing) {
      console.log(`Execution time: ${timing}ms`);
    }
  },
});

module.exports = sequelize;
