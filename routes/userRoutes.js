// userRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
// Pastikan semua model yang dibutuhkan diimpor dari models/index.js
const { User, Vehicle, ServiceHistory, sequelize } = require('../models');
const authMiddleware = require('../utils/authMiddleware'); // Sesuaikan path jika perlu
const multer = require('multer');
const path = require('path');
const { generateInitialSchedules } = require('../utils/maintenanceScheduler'); // Sesuaikan path
const { console } = require('inspector');

const router = express.Router();

// --- Konfigurasi Multer ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/profile_pictures/';
    // Anda mungkin perlu membuat folder ini secara manual atau menggunakan fs.mkdirSync
    // const fs = require('fs');
    // fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Pastikan req.user ada; ini berarti endpoint upload harus setelah authMiddleware
    const userIdForFilename = req.user ? req.user.id : 'guest';
    cb(null, userIdForFilename + '-' + Date.now() + path.extname(file.originalname));
  }
});

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Hanya gambar (jpeg, jpg, png, gif) yang diizinkan!');
  }
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: checkFileType
}).single('profilePicture'); // Nama field dari frontend harus 'profilePicture'

const createStorage = (destinationPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + extension);
},
});
};

const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only image files (jpeg, png, gif, webp) are allowed!"
      ),
      false
    );
  }
};

const uploadProfilePicture = multer({
  storage: createStorage('uploads/profile_pictures/'),
  limits: {
    fileSize: 1024 * 1024 * 2,
  },
  fileFilter: imageFileFilter,
}).single("profilePicture");

// --- Fungsi Helper untuk Logo (jika masih digunakan) ---
function getLogoUrl(brand, model) {
  let logoUrl = null;
  const brandLower = brand ? brand.toLowerCase() : '';
  const modelLower = model ? model.toLowerCase() : '';

  if (brandLower === 'honda') {
    if (modelLower.includes('beat')) logoUrl = '/logos/honda_beat.png';
    else if (modelLower.includes('vario')) logoUrl = '/logos/honda_vario.png';
    else if (modelLower.includes('pcx')) logoUrl = '/logos/honda_pcx.png';
    else if (modelLower.includes('scoopy')) logoUrl = '/logos/honda_scoopy.png';
    // Tambahkan model Honda lainnya
  } else if (brandLower === 'yamaha') {
    if (modelLower.includes('aerox')) logoUrl = '/logos/yamaha_aerox.png';
    else if (modelLower.includes('nmax')) logoUrl = '/logos/yamaha_nmax.png';
    else if (modelLower.includes('lexi')) logoUrl = '/logos/yamaha_lexi.png';
    // Tambahkan model Yamaha lainnya
  } else if (brandLower === 'suzuki') {
    if (modelLower.includes('nexii') || modelLower.includes('nex ii') || modelLower.includes('nex 2')) logoUrl = '/logos/suzuki_nexii.png';
    // Tambahkan model Suzuki lainnya
  }
  // Pastikan path logo ini benar dan file ada di folder public/logos/
  return logoUrl;
}


// --- User Registration ---
// POST /api/users/register
router.post('/register', async (req, res) => {
  const {
    name, email, password, address,
    plate_number, brand, model, current_odometer, last_service_date
    // initialServices akan diambil langsung dari req.body.initialServices
  } = req.body;

  // Validasi input dasar
  if (!name || !email || !password || !plate_number || !brand || !model || current_odometer === undefined) {
    return res.status(400).json({ message: 'Data pengguna dan kendaraan utama tidak boleh kosong.' });
  }

  const t = await sequelize.transaction();

  try {
    // Cek apakah email sudah ada
    const existingUser = await User.findOne({ where: { email: email } }, { transaction: t });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ message: 'Email sudah terdaftar.' });
    }

    // Buat user baru
    const newUser = await User.create({
      name,
      email,
      password_hash: password, // Model User akan menghash ini menggunakan hook beforeCreate
      address: address || null,
    }, { transaction: t });

    const logoUrlForVehicle = getLogoUrl(brand, model);

    // Buat kendaraan baru
    const newVehicle = await Vehicle.create({
      user_id: newUser.user_id,
      plate_number,
      brand,
      model,
      current_odometer: parseInt(current_odometer, 10) || 0,
      last_service_date: last_service_date || null,
      logo_url: logoUrlForVehicle, // Simpan URL logo
      last_odometer_update: new Date(), // Set last_odometer_update saat pembuatan
    }, { transaction: t });

    // Proses initialServices jika ada
    const receivedInitialServices = req.body.initialServices; // Ambil dari req.body

    if (receivedInitialServices && Array.isArray(receivedInitialServices) && receivedInitialServices.length > 0) {
      console.log('[userRoutes] Processing initial services:', receivedInitialServices);
      for (const service of receivedInitialServices) {
        if (service.service_type && service.odometer_at_service !== undefined && service.service_date) {
          await ServiceHistory.create({
            vehicle_id: newVehicle.vehicle_id, // Gunakan ID kendaraan yang baru dibuat
            service_date: service.service_date,
            odometer_at_service: parseInt(service.odometer_at_service, 10),
            service_type: service.service_type,
            description: service.description || 'Servis awal saat registrasi',
            workshop_name: service.workshop_name || null,
            cost: service.cost ? parseFloat(service.cost) : null,
          }, { transaction: t });
        } else {
          console.warn('[userRoutes] Skipping incomplete initial service entry:', service);
        }
      }
    } else {
      console.log('[userRoutes] No initial services provided or an empty array.');
    }

    // Panggil generateInitialSchedules setelah semua data (termasuk riwayat awal) disimpan
    // dan transaksi siap di-commit.
    // generateInitialSchedules bisa dipanggil setelah commit jika tidak perlu bagian dari transaksi ini.
    // Jika generateInitialSchedules melakukan operasi DB yang harus atomik dengan registrasi, sertakan 't'.
    await generateInitialSchedules(newVehicle.vehicle_id, t); // Kirim transaksi jika scheduler membutuhkannya

    await t.commit(); // Commit transaksi

    // Buat token JWT
    const payload = { user: { id: newUser.user_id, name: newUser.name, email: newUser.email } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }); // Token berlaku 7 hari

    res.status(201).json({
      message: 'Pengguna dan kendaraan berhasil didaftarkan!',
      user: {
        user_id: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
        address: newUser.address,
        photo_url: newUser.photo_url // Kirim photo_url jika ada (defaultnya null)
      },
      vehicle: { // Kirim detail kendaraan yang baru dibuat
        vehicle_id: newVehicle.vehicle_id,
        plate_number: newVehicle.plate_number,
        brand: newVehicle.brand,
        model: newVehicle.model,
        current_odometer: newVehicle.current_odometer,
        logo_url: newVehicle.logo_url
      },
      token
    });

  } catch (error) {
    if (t && !t.finished && !t.rolledBack) { // Pastikan rollback hanya jika belum selesai atau di-rollback
        await t.rollback();
    }
    console.error('Error registrasi:', error);
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      const messages = error.errors.map(e => e.message);
      return res.status(400).json({ message: 'Validasi gagal atau data duplikat.', errors: messages });
    }
    res.status(500).json({ message: 'Error server saat registrasi.', error: error.message });
  }
});


// --- User Login ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi.' });
  }
  try {
    const user = await User.findOne({ where: { email: email } });
    if (!user) {
      return res.status(401).json({ message: 'Kredensial tidak valid.' });
    }
    const isMatch = await user.isValidPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Kredensial tidak valid.' });
    }
    const payload = { user: { id: user.user_id, name: user.name, email: user.email } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: 'Login berhasil!',
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        address: user.address,
        photo_url: user.photo_url
      }
    });
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ message: 'Error server saat login.', error: error.message });
  }
});

// --- Get User Profile ---
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['user_id', 'name', 'email', 'address', 'photo_url', 'createdAt', 'updatedAt']
    });
    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error mengambil profil:', error);
    res.status(500).json({ message: 'Error server saat mengambil profil.', error: error.message });
  }
});

// --- Update User Profile (Nama, Alamat) ---
router.put('/profile/update', authMiddleware, async (req, res) => {
  const { name, address } = req.body;
  const userId = req.user.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }

    if (name !== undefined) user.name = name;
    if (address !== undefined) user.address = address; // Izinkan null untuk menghapus alamat

    await user.save();
    res.json({ message: 'Profil berhasil diperbarui.', user: { name: user.name, address: user.address, email: user.email, photo_url: user.photo_url } });
  } catch (error) {
    console.error('Error update profil:', error);
    res.status(500).json({ message: 'Error server saat update profil.', error: error.message });
  }
});


// --- Upload Profile Picture ---
// Pastikan authMiddleware dijalankan SEBELUM multer mencoba mengakses req.user
router.post('/profile/upload-picture', authMiddleware, (req, res) => {
  uploadProfilePicture(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: err.message || err });
    }
    if (req.file == undefined) {
      return res.status(400).json({ message: 'Tidak ada file gambar yang dipilih.' });
    }

    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
      }
      // Simpan path relatif ke database
      const filePath = `/uploads/profile_pictures/${req.file.filename}`;
      user.photo_url = filePath;
      await user.save();
      res.json({
        message: 'Foto profil berhasil diunggah!',
        filePath: filePath // Kirim path kembali ke client
      });
    } catch (error) {
      console.error('Error saving file path to DB:', error);
      res.status(500).json({ message: 'Error server saat menyimpan foto profil.', error: error.message });
    }
  });
});


module.exports = router;
