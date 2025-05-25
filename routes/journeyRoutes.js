const express = require('express');
const Journey = require('../models/Journey');
const { authenticate } = require('../utils/authMiddleware');
const router = express.Router();

// Add Journey
router.post('/', authenticate, async (req, res) => {
  const { plat_nomor, tanggal_perjalanan, jarak_tempuh, lokasi_awal, lokasi_akhir } = req.body;
  try {
    const journeyData = { plat_nomor, tanggal_perjalanan, jarak_tempuh, lokasi_awal, lokasi_akhir };
    await Journey.insert_data(journeyData);
    res.status(201).json({ message: 'Journey added successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in adding journey', error });
  }
});

// Update Journey
router.put('/:id_perjalanan', authenticate, async (req, res) => {
  const { id_perjalanan } = req.params;
  const journeyData = req.body;

  try {
    await Journey.update_data(journeyData, id_perjalanan);
    res.status(200).json({ message: 'Journey updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating journey', error });
  }
});

module.exports = router;
