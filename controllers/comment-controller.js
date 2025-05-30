// const { params } = require('../app');
const { prisma } = require("../prisma/prisma-client");

const CommentController = {
  // createComment: async (req, res) => {
  //   // console.log('hello');
  //   try {
  //     const { id } = req.params;
  //     const { text } = req.body;
  //     const userId = req.user.userId;
  //     if (!id || !text || !userId) {
  //       return res.status(400).json({ error: 'Все поля обязательны' });
  //     }
  //     const product = await prisma.product.findUnique({where: {id}})
  //     if (!product) {
  //       return res.status(404).json({error: "Продукт не найден"})
  //     }

  //     const comment = await prisma.comment.create({
  //       data: {
  //         productId: id,
  //         userId,
  //         text
  //       },
  //     });

  //     res.json(comment);
  //   } catch (error) {
  //     console.error('Error creating comment:', error);
  //     res.status(500).json({ error: 'Не удалось создать комментарий' });
  //   }
  // },
  createComment: async (req, res) => {
  try {
    const { id } = req.params; // id продукта
    const { text } = req.body;

    if (!req.user || !req.user.userId) {
      // Пользователь не авторизован
      return res.status(301).json({ error: "Нужна регистрация" });
    }
    
    const userId = req.user.userId;

    if (!id || !text) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Продукт не найден" });
    }

    // Проверка: покупал ли пользователь этот товар
    const purchased = await prisma.order.findFirst({
      where: {
        userId,
        items: {
          some: {
            productId: id,
          },
        },
      },
    });

    if (!purchased) {
      return res.status(403).json({
        error: "Вы можете оставить комментарий только на купленный товар",
      });
    }

    const comment = await prisma.comment.create({
      data: {
        productId: id,
        userId,
        text,
      },
    });

    res.json(comment);
  } catch (error) {
    console.error("Ошибка при создании комментария:", error.message, error);
    res.status(500).json({ error: "Не удалось создать комментарий" });
  }
},

  deleteComment: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      // Check if comment exists
      const comment = await prisma.comment.findUnique({ where: { id } });

      if (!comment) {
        return res.status(404).json({ error: "Комментарий не найден" });
      }

      // Check if the user is the owner of the comment
      if (comment.userId !== userId) {
        return res
          .status(403)
          .json({ error: "Вы не авторизованы для удаления этого комментария" });
      }

      // Delete the comment
      await prisma.comment.delete({ where: { id } });

      res.json(comment);
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Не удалось удалить комментарий" });
    }
  },

  deleteAdminComment: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if comment exists
      const comment = await prisma.comment.findUnique({ where: { id } });

      if (!comment) {
        return res.status(404).json({ error: "Комментарий не найден" });
      }

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

      // res.json(userID)
      if (userID.role != "ADMIN") {
        return res.status(400).json({ error: "У вас нет на это прав" });
      }

      // Delete the comment
      await prisma.comment.delete({ where: { id } });

      res.json(comment);
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Не удалось удалить комментарий" });
    }
  },

  updateComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const userId = req.user.userId;
      console.log("ID:", id);
      console.log("Text:", text);
      console.log("USerID:", userId);

      // Check if comment exists
      const comment = await prisma.comment.findUnique({ where: { id } });

      if (!comment) {
        return res.status(404).json({ error: "Комментарий не найден" });
      }

      // Check if the user is the owner of the comment
      if (comment.userId !== userId) {
        return res.status(403).json({
          error: "Вы не авторизованы для изменения этого комментария",
        });
      }

      // Delete the comment
      const commentUp = await prisma.comment.update({
        where: { id },
        data: {
          text: text || undefined,
        },
      });

      res.json(commentUp);
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Не удалось удалить комментарий" });
    }
  },

  getAllComments: async (req, res) => {
    try {
      const { productid } = req.params;
      console.log("productid:", productid);
      if (!productid) {
        return res.status(400).json({ error: "ID продукта обязательно" });
      }

      const comments = await prisma.comment.findMany({
        where: {
          productId: productid,
          visible: true, // ✅ показываем только одобренные комментарии
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(comments);
    } catch (error) {
      console.error("Error getting comments:", error);
      res.status(500).json({ error: "Не удалось получить комментарии" });
    }
  },

  moderateComment: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res
          .status(403)
          .json({ error: "Недостаточно прав для модерации" });
      }

      const comment = await prisma.comment.findUnique({ where: { id } });

      if (!comment) {
        return res.status(404).json({ error: "Комментарий не найден" });
      }

      const updatedComment = await prisma.comment.update({
        where: { id },
        data: { visible: true },
      });

      res.json({ message: "Комментарий одобрен", comment: updatedComment });
    } catch (error) {
      console.error("Ошибка при модерации комментария:", error.message, error);
      res.status(500).json({ error: "Не удалось обновить комментарий" });
    }
  },
  getPendingComments: async (req, res) => {
    try {
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res
          .status(403)
          .json({ error: "Недостаточно прав для просмотра комментариев" });
      }

      const comments = await prisma.comment.findMany({
        where: {
          visible: false,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          product: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(comments);
    } catch (error) {
      console.error("Ошибка при получении непроверенных комментариев:", error);
      res.status(500).json({ error: "Не удалось получить список" });
    }
  },
};

module.exports = CommentController;
