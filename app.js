const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const fs = require('fs')
const cors = require('cors');
require('dotenv').config();
const YooKassa = require('yookassa');
const kassa = new YooKassa({
  shopId: process.env.SHOP_ID,
  secretKey: process.env.SHOP_SECRET,
});

const app = express();

const allowedOrigins = [
  `http://${process.env.BASE_URL}`,
  `http://${process.env.BASE_URL}:80`,
  `http://${process.env.BASE_URL}:3000`,
  `http://localhost:3000`,
  `http://localhost.214`,
  `http://localhost:80`,
  'http://localhost:5173',
  process.env.BASE_URL_FRONT
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH", "OPTIONS"],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.set('view engine', 'pug');

app.use('/uploads', express.static('uploads'))

app.use('/api', require('./routes'));



app.post("/api/create-payment", async (req, res) => {
  try {
    const { amount, description } = req.body;

    const payment = await kassa.createPayment({
      amount: { value: amount.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: {
        type: "embedded",
      },
      description: description || "Оплата заказа",
    });
    console.log("Создан платёж:", payment)
    res.json(payment);
  } catch (err) {
    console.error("Ошибка платежа:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Ошибка создания платежа" });
  }
});



if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.status(err.status || 500).json({
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {}
  });
});

module.exports = app;
