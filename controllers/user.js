const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma/prisma-client");
const Jdenticon = require("jdenticon");
const nodemailer = require("nodemailer");
const uuid = require("uuid");

const UserController = {
  register: async (req, res) => {
    const { email, password, name, phone } = req.body;

    // Проверяем поля на существование
    if (!email || !password || !name || !phone) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }
    // res.send(email, password, name);
    try {
      // Проверяем, существует ли пользователь с таким emai
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "Пользователь уже существует" });
      }

      // Хешируем пароль
      const hashedPassword = await bcrypt.hash(password, 10);
      const activationLink = uuid.v4();

      // Генерируем аватар для нового пользователя
      const png = Jdenticon.toPng(name, 200);
      const avatarName = `${name}_${Date.now()}.png`;
      const avatarPath = path.join(__dirname, "/../uploads", avatarName);
      fs.writeFileSync(avatarPath, png);

      // const refreshToken = jwt.sign(email, process.env.REFREH_SECRET_KEY);

      // Создаем пользователя
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone,
          avatarUrl: `/uploads/${avatarName}`,
          // refreshToken: refreshToken,
          activatedLink: activationLink,
        },
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: `${process.env.EMAIL}`, // Ваш Gmail
          pass: `${process.env.EMAIL_PASSWORD}`, // Пароль приложения (не основной пароль!)
        },
      });

      // Настройки письма
      const mailOptions = {
        from: `"Название Вашего СервисаВВВВВВ" <${process.env.EMAIL}>`,
        to: email, // Кому
        subject: "Добро пожаловать в Мой Сервис",
        html: `
              <h1>Добро пожаловать, ${name}!</h1>
              <p>Спасибо за регистрацию в нашем сервисе.</p>
              <p>Ваш email: <strong>http://${process.env.BASE_URL}/active/${activationLink}</strong></p>
              `,
        text: `Добро пожаловать, ${name}!\n\nСпасибо за регистрацию.\n\nВаш email: ${email}`,
      };

      // Отправка
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error:", error);
        } else {
          console.log("Email sent:", info.response);
        }
      });

      res.json(user);
    } catch (error) {
      console.error("Error in register:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  login: async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }
    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(400).json({ error: "Неверный логин или пароль" });
      }

      const valid = await bcrypt.compare(password, user.password);

      if (!valid) {
        return res.status(400).json({ error: "Неверный логин или пароль" });
      }

      if (!user.isActivated) {
        return res.status(403).json({
          error:
            "Аккаунт не активирован. Пожалуйста, проверьте вашу почту для активации.",
        });
      }

      const token = jwt.sign({ userId: user.id }, process.env.SECRET_KEY, {
        expiresIn: "10m",
      }); //сюда можно добавить время жизни токена
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.REFREH_SECRET_KEY,

        { expiresIn: "5d" }
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: refreshToken },
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        maxAge: 5 * 24 * 60 * 60 * 1000,
      });


      console.log("Cookie set:", refreshToken);
      res.json({ token });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },

  getUserById: async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },

  updateUser: async (req, res) => {
    const { id } = req.params;
    const { name, phone } = req.body;
    const file = req.file;

    if (id !== req.user.userId) {
      return res.status(403).json({ error: "Нет доступа" });
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          name: name || undefined,
          avatarUrl: file ? `/uploads/${file.filename}` : undefined,
          phone: phone || undefined,
        },
      });
      res.json(user);
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },

  current: async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        products: {
          include: {
            variants: {
              include: {
                images: true,
              },
            },
          },
        },
        likes: true,
        comments: true,
        chat: true,
        cart: {
          include: {
            items: {
              include: {
                product: {
                  include: {
                    variants: {
                      include: {
                        images: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Не удалось найти пользователя" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.log("err", error);
    res.status(500).json({ error: "Что-то пошло не так" });
  }
},

  allUsers: async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          products: true,
          likes: true,
          comments: true,
          chat: true,
          cart: true,
        },
      });
      return res.status(200).json(users);
    } catch (error) {
      console.error("Ошибка при получении пользователей:", error);
      return res.status(500).json({
        error: "Произошла ошибка при получении данных пользователей",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  refresh: async (req, res) => {
    try {
      // Получаем refreshToken из cookies
      const refreshToken = req.cookies.refreshToken;

      // УБРАТЬ эту строку, иначе ответ уйдет раньше времени
      // res.send(refreshToken);

      if (!refreshToken) {
        return res.status(401).json({ error: "Refresh token отсутствует" });
      }

      // Проверяем refreshToken
      const decoded = jwt.verify(refreshToken, process.env.REFREH_SECRET_KEY);
      // console.log(refreshToken)
      // Ищем пользователя в БД
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      // Если пользователя нет или токен не совпадает
      if (!user || user.refreshToken !== refreshToken) {
        return res
          .status(403)
          .json({ error: "Недействительный refresh token" });
      }

      // Генерируем новые токены
      const newToken = jwt.sign({ userId: user.id }, process.env.SECRET_KEY, {
        expiresIn: "10m",
      });

      const newRefreshToken = jwt.sign(
        { userId: user.id },
        process.env.REFREH_SECRET_KEY,
        { expiresIn: "5d" }
      );

      // Обновляем refreshToken в базе
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken },
      });

      // Устанавливаем новый refreshToken в cookie
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        maxAge: 5 * 24 * 60 * 60 * 1000, // 5 дней
        // secure: true, // для HTTPS
        // sameSite: "strict",
      });

      // Отправляем новый access token клиенту
      res.json({ token: newToken });
    } catch (error) {
      console.error("Error in refresh:", error);

      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: "Refresh token истек" });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return res
          .status(403)
          .json({ error: "Недействительный refresh token" });
      }

      // Общая ошибка сервера
      res.status(500).json({ error: "Ошибка сервера" });
    }
  },

  activate: async (req, res) => {
    try {
      const { link } = req.params;

      // 1. Находим пользователя по activatedLink
      const user = await prisma.user.findFirst({
        where: { activatedLink: link },
      });

      if (!user) {
        return res.status(404).json({ error: "Ссылка активации не найдена" });
      }

      // 2. Обновляем пользователя по его id (уникальному полю)
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { isActivated: true },
      });

      res.json(updatedUser);
    } catch (error) {
      console.log("err", error);
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { id } = req.body;
      // res.send(id);
      if (!id) {
        return res.status(400).json({ error: "Не указан ID пользователя" });
      }

      await prisma.cartItem.deleteMany({
        where: {
          cart: {
            userId: id,
          },
        },
      });

      await prisma.cart.deleteMany({
        where: { userId: id },
      });

      // res.send(id)
      const userID = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: {
          email: false,
          products: true,
          likes: true,
          comments: true,
          chat: true,
          cart: true,
        },
      });

      if (id == req.user.userId) {
        return res.status(400).json({ error: "Нельзя удалить самого себя" });
      }
      // res.json(userID)
      if (userID.role != "ADMIN") {
        return res.status(400).json({ error: "У вас нет на это прав" });
      }

      const userToDelete = await prisma.user.findUnique({
        where: { id: id },
      });

      if (!userToDelete) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // Удаляем пользователя
      const deletedUser = await prisma.user.delete({
        where: { id: id },
      });

      res.json({ message: "Пользователь успешно удалён", deletedUser });
    } catch (error) {
      console.log("err", error);
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },

  updateRole: async (req, res) => {
    const { id, name, phone, role, isActivated } = req.body;
    const file = req.file;

    const activated = isActivated == "true";

    if (!id) {
      return res.status(400).json({ error: "Не указан ID пользователя" });
    }

    try {
      const userID = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (userID.role !== "ADMIN") {
        return res.status(403).json({ error: "Нет прав" });
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          name: name || undefined,
          phone: phone || undefined,
          role: role || undefined,
          isActivated: activated, // 👈 boolean сюда
          avatarUrl: file ? `/uploads/${file.filename}` : undefined,
        },
      });

      res.json(user);
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  },

  createAdmin: async (req, res) => {
    const { email, password, name, adminpassword } = req.body;

    if (!email || !password || !name || !adminpassword) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    if (adminpassword != process.env.ADMIN_PASSWORD) {
      return res.status(400).json({ error: "Не верный пароль" });
    }
    try {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "Пользователь уже существует" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const activationLink = uuid.v4();
      const png = Jdenticon.toPng(name, 200);
      const avatarName = `${name}_${Date.now()}.png`;
      const avatarPath = path.join(__dirname, "/../uploads", avatarName);
      fs.writeFileSync(avatarPath, png);

      const refreshToken = jwt.sign(email, process.env.REFREH_SECRET_KEY);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          avatarUrl: `/uploads/${avatarName}`,
          refreshToken: refreshToken,
          activatedLink: activationLink,
          role: "ADMIN",
          isActivated: true,
        },
      });

      res.json(user);
    } catch (error) {
      console.error("Error in register:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
};

module.exports = UserController;
