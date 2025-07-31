const { VehicleCoding } = require('../models');
const { Op } = require('sequelize');

async function getVehicleCode(brand, model, year) {
  if (!brand || !model || !year) {
    return null;
  }

  try {
    const coding = await VehicleCoding.findOne({
      where: {
        brand: { [Op.Like]: `%${brand}%` },
        model: { [Op.Like]: `%${model}%` },
        year_start: { [Op.lte]: year },
        year_end: { [Op.gte]: year },
      },
    });

    if (coding) {
      console.log(`[VehicleIdentifier] Found code: ${coding.vehicle_code} for ${brand} ${model} ${year}`);
      return coding.vehicle_code;
    }
    console.log(`[VehicleIdentifier] No code found for ${brand} ${model} ${year}`);
    return null;
  } catch (error) {
    console.error('[VehicleIdentifier] Error fetching vehicle code:', error);
    return null;
  }
}

module.exports = { getVehicleCode };