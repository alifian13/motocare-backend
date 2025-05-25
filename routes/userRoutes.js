// userRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Vehicle, ServiceHistory, sequelize } = require('../models'); // ServiceHistory diimpor di sini
const authMiddleware = require('../utils/authMiddleware'); // Sesuaikan path jika perlu
const multer = require('multer');
const path = require('path');
const { generateInitialSchedules } = require('../utils/maintenanceScheduler');

const router = express.Router();

// --- Konfigurasi Multer (Sudah Benar) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Pastikan folder ini ada, atau buat secara dinamis jika perlu
    const uploadPath = 'uploads/profile_pictures/';
    // fs.mkdirSync(uploadPath, { recursive: true }); // Untuk membuat folder jika belum ada
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
}).single('profilePicture');

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Hanya gambar (jpeg, jpg, png, gif) yang diperbolehkan!');
  }
}

// --- Fungsi Helper untuk Logo (Sudah Benar) ---
function getLogoUrl(brand, model) {
  let logoUrl = null;
  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();

  if (brandLower === 'honda') {
    if (modelLower.includes('beat')) logoUrl = '/logos/honda_beat.png';
    else if (modelLower.includes('vario')) logoUrl = '/logos/honda_vario.png';
    else if (modelLower.includes('pcx')) logoUrl = '/logos/honda_pcx.png';
    else if (modelLower.includes('scoopy')) logoUrl = '/logos/honda_scoopy.png';
  } else if (brandLower === 'yamaha') {
    if (modelLower.includes('aerox')) logoUrl = '/logos/yamaha_aerox.png';
    else if (modelLower.includes('nmax')) logoUrl = '/logos/yamaha_nmax.png';
    else if (modelLower.includes('lexi')) logoUrl = '/logos/yamaha_lexi.png';
  } else if (brandLower === 'suzuki') {
    if (modelLower.includes('nexii') || modelLower.includes('nex ii') || modelLower.includes('nex 2')) logoUrl = '/logos/suzuki_nexii.png';
  }
  return logoUrl;
}

// --- User Registration ---
// POST /api/users/register
router.post('/register', async (req, res) => {
  const {
    name, email, password, address,
    plate_number, brand, model, current_odometer, last_service_date,
    initial_services // Array opsional
  } = req.body;

  if (!name || !email || !password || !plate_number || !brand || !model) {
    return res.status(400).json({ message: 'Kolom wajib (pengguna & kendaraan) tidak boleh kosong.' });
  }

  const t = await sequelize.transaction();
  try {
    const existingUser = await User.findOne({ where: { email: email } }, { transaction: t });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ message: 'Email sudah terdaftar.' });
    }

    // user baru
    const newUser = await User.create({
      name, email,
      password_hash: password, // Akan di-hash oleh hook User.beforeCreate
      address: address || null,
    }, { transaction: t });

    // 2. Dapatkan URL logo
    const logoUrlForVehicle = getLogoUrl(brand, model);

    let odoUntukKendaraan = current_odometer || 0;
    let tglServisTerakhirKendaraan = last_service_date || null;

    // proses initial_service
    if (initial_services && Array.isArray(initial_services) && initial_services.length > 0) {
      let maxOdoFromHistory = 0;
      let latestServiceDateFromHistory = null;

      for (const service of initial_services) {
        if (service.service_type && service.odometer_at_service) {
          const odoService = parseInt(service.odometer_at_service, 10);
          await ServiceHistory.create({
            vehicle_id: null, // Akan diisi setelah newVehicle dibuat, atau perlu query ulang setelahnya
            service_date: service.service_date || new Date(),
            odometer_at_service: odoService,
            service_type: service.service_type,
          }, { transaction: t }); // Sementara vehicle_id null

          if (odoService > maxOdoFromHistory) {
            maxOdoFromHistory = odoService;
          }
          if (service.service_date) {
            const currentServiceDate = new Date(service.service_date);
            if (!latestServiceDateFromHistory || currentServiceDate > latestServiceDateFromHistory) {
              latestServiceDateFromHistory = currentServiceDate;
            }
          }
        }
      }
      if (maxOdoFromHistory > odoUntukKendaraan) {
        odoUntukKendaraan = maxOdoFromHistory;
      }
      if (latestServiceDateFromHistory && (!tglServisTerakhirKendaraan || latestServiceDateFromHistory > new Date(tglServisTerakhirKendaraan))) {
          tglServisTerakhirKendaraan = latestServiceDateFromHistory.toISOString().split('T')[0];
      }
    }

    // 3. Baru buat kendaraan menggunakan newUser.user_id
    const newVehicle = await Vehicle.create({
      user_id: newUser.user_id,
      plate_number, brand, model,
      current_odometer: odoUntukKendaraan,
      last_service_date: tglServisTerakhirKendaraan,
      logo_url: logoUrlForVehicle,
      last_odometer_update: new Date(),
    }, { transaction: t });

    // Jika initial_services ada, update vehicle_id nya sekarang
     if (initial_services && Array.isArray(initial_services) && initial_services.length > 0) {
        for (const service of initial_services) {
             if (service.service_type && service.odometer_at_service) {
                 // Ini cara sederhana, idealnya Anda mengumpulkan ID service history yang baru dibuat
                 // atau melakukan update berdasarkan kriteria lain jika tidak ada ID.
                 // Untuk contoh, kita anggap kita bisa mengidentifikasi entri yang baru dibuat.
                 // Lebih baik: buat entri ServiceHistory setelah newVehicle.vehicle_id ada.
             }
        }
        // Cara yang lebih baik untuk initial_services:
        // Setelah newVehicle dibuat dan memiliki ID:
        if (newVehicle.vehicle_id && initial_services && Array.isArray(initial_services)) {
            for (const service of initial_services) {
                if (service.service_type && service.odometer_at_service) {
                    await ServiceHistory.create({
                        vehicle_id: newVehicle.vehicle_id, // Sekarang vehicle_id sudah ada
                        service_date: service.service_date || new Date(),
                        odometer_at_service: parseInt(service.odometer_at_service, 10),
                        service_type: service.service_type,
                    }, { transaction: t });
                }
            }
        }
    }

    await t.commit(); // Commit transaksi jika semua berhasil
    if (newVehicle && newVehicle.vehicle_id) {
        generateInitialSchedules(newVehicle.vehicle_id).catch(err => {
            console.error("Error generating initial schedules post-registration:", err);
            // Ini proses background, tidak perlu menggagalkan respons utama
        });
    }

    res.status(201).json({
      message: 'Pengguna dan kendaraan berhasil didaftarkan!',
      user: {
        user_id: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
        address: newUser.address
      },
      vehicle: {
        vehicle_id: newVehicle.vehicle_id,
        plate_number: newVehicle.plate_number,
        brand: newVehicle.brand,
        model: newVehicle.model,
        logo_url: newVehicle.logo_url
      }
    });

  } catch (error) {
    if (t && !t.finished) await t.rollback(); // Rollback jika ada error
    console.error('Error registrasi:', error);
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      const messages = error.errors.map(e => e.message);
      return res.status(400).json({ message: 'Validasi gagal atau data duplikat.', errors: messages });
    }
    res.status(500).json({ message: 'Error server saat registrasi.', error: error.message });
  }
});

// --- User Login (Sudah Benar) ---
router.post('/login', async (req, res) => {
  // ... (kode login Anda yang sudah ada, terlihat sudah benar)
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi.' });
  }

  try {
    const user = await User.findOne({ where: { email: email } });

    if (!user) {
      return res.status(401).json({ message: 'Kredensial tidak valid (email salah).' });
    }

    const isMatch = await user.isValidPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Kredensial tidak valid (password salah).' });
    }

    const payload = {
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) {
            console.error("Error signing JWT:", err);
            return res.status(500).json({ message: 'Gagal membuat token.' });
        }
        // Kirim data user yang relevan (tanpa password)
        res.json({
          message: 'Login berhasil!',
          token,
          user: { // Pastikan data user yang dikirim relevan dan aman
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            address: user.address,
            photo_url: user.photo_url // Kirim juga photo_url jika ada
          }
        });
      }
    );
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ message: 'Error server saat login.', error: error.message });
  }
});

// --- Endpoint Profil (Sudah Benar) ---
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // req.user.id diambil dari token JWT setelah melewati authMiddleware
    const user = await User.findByPk(req.user.id, {
      // Pilih atribut yang ingin dikembalikan ke frontend
      // Pastikan 'photo_url' ada di tabel 'users' Anda
      attributes: ['user_id', 'name', 'email', 'address', 'photo_url', 'createdAt', 'updatedAt']
    });

    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }

    // Kirim data pengguna sebagai respons JSON
    res.json(user); // Secara default, user.toJSON() akan dipanggil oleh res.json()

  } catch (error) {
    console.error('Error mengambil profil:', error);
    res.status(500).json({ message: 'Error server saat mengambil profil.', error: error.message });
  }
});
router.put('/profile', authMiddleware, async (req, res) => { /* ... kode Anda ... */ });
router.post('/profile/picture', authMiddleware, (req, res) => { /* ... kode Anda ... */ });


module.exports = router;