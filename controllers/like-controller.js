const { prisma } = require("../prisma/prisma-client");

const LikeController = {
  rateProduct: async (req, res) => {
  try {
    const { productId, rating } = req.body;
    const userId = req.user.userId;

    // Валидация входных данных
    if (!productId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: "Необходимо указать productId и рейтинг от 1 до 5" 
      });
    }

    // Проверка существования товара
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });
    if (!product) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    // Проверка покупки товара (аналогично проверке для комментариев)
    const purchased = await prisma.order.findFirst({
      where: {
        userId,
        items: {
          some: {
            productId: productId,
          },
        },
        // status: "COMPLETED" // Проверяем только завершенные заказы
      },
    });

    if (!purchased) {
      return res.status(403).json({ 
        error: "Вы можете оценить только купленные товары" 
      });
    }

    // Проверка существующей оценки
    const existingRating = await prisma.like.findFirst({
      where: { productId, userId },
    });

    if (existingRating) {
      // Обновляем существующую оценку
      const updatedRating = await prisma.like.update({
        where: { id: existingRating.id },
        data: { rating },
      });
      return res.json(updatedRating);
    }

    // Создаем новую оценку
    const newRating = await prisma.like.create({
      data: {
        productId,
        userId,
        rating,
      },
    });

    res.json(newRating);
  } catch (error) {
    console.error("Ошибка при оценке товара:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
},

  unlikeProduct: async (req, res) => {
    const { id } = req.body;

    const userId = req.user.userId;

    if (!id) {
      return res
        .status(400)
        .json({ error: "Вы уже поставили дизлайк этому посту" });
    }

    try {
      const existingLike = await prisma.like.findFirst({
        where: { productId: id, userId },
      });

      if (!existingLike) {
        return res.status(400).json({ error: "Лайк уже существует" });
      }

      const like = await prisma.like.deleteMany({
        where: { productId: id, userId },
      });

      res.json(like);
    } catch (error) {
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },

  deleteRating: async (req, res) => {
    const { productId } = req.body;
    const userId = req.user.userId;

    if (!productId) {
      return res.status(400).json({ error: "Не указан productId" });
    }

    try {
      const existingLike = await prisma.like.findFirst({
        where: { productId, userId },
      });

      if (!existingLike) {
        return res.status(400).json({ error: "Рейтинг не найден" });
      }

      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      res.json({ message: "Рейтинг удалён" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Что-то пошло не так" });
    }
  },
};

module.exports = LikeController;
