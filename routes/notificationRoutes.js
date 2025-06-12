// routes/notificationRoutes.js
const express = require('express');
const { Notification } = require('../models'); // Impor sudah benar dari models/index.js
// Pastikan path ke authMiddleware sudah benar
const authMiddleware = require('../utils/authMiddleware'); // Jika ada di folder middleware
// const authMiddleware = require('../utils/authMiddleware'); // Jika ada di folder utils
const router = express.Router();

// GET /api/notifications/my-notifications (Menggunakan user ID dari token)
router.get('/my-notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Pastikan Notification sudah diimpor dan terdefinisi
    if (!Notification) {
        console.error("Notification model is undefined in notificationRoutes!");
        return res.status(500).json({ message: 'Server configuration error (Notification not found).' });
    }

    const notifications = await Notification.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { notification_id: notificationId, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
    }

    notification.is_read = true;
    await notification.save();

    res.json({ message: 'Notifikasi ditandai sudah dibaca.', notification });
  } catch (error) {
    console.error('Error menandai notifikasi terbaca:', error);
    res.status(500).json({ message: 'Gagal menandai notifikasi.', error: error.message });
  }
});

// Endpoint POST untuk notifikasi juga harus menggunakan model Sequelize
// seperti contoh yang saya berikan di respons sebelumnya.

module.exports = router;