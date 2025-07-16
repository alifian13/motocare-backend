const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('motocare', 'root', '', {
  host: 'localhost',
  dialect: 'mysql',
  logging: (sql, timing) => {
    console.log(`Executed SQL: ${sql}`);
    if (timing) {
      console.log(`Execution time: ${timing}ms`);
    }
  },
});

module.exports = sequelize;
