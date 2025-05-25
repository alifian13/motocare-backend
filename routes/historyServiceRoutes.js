const express = require('express');
const HistoryService = require('../models/HistoryService');
const { authenticate } = require('../utils/authMiddleware');
const router = express.Router();

// Show History Service
router.get('/:plat_nomor', authenticate, async (req, res) => {
  const { plat_nomor } = req.params;
  try {
    const history = await HistoryService.show_data(plat_nomor);
    res.status(200).json({ history });
  } catch (error) {
    res.status(500).json({ message: 'Error in fetching history service', error });
  }
});

// Update History Service
router.put('/:id_history_service', authenticate, async (req, res) => {
  const { id_history_service } = req.params;
  const historyData = req.body;

  try {
    await HistoryService.update_data(historyData, id_history_service);
    res.status(200).json({ message: 'History service updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error in updating history service', error });
  }
});

module.exports = router;
