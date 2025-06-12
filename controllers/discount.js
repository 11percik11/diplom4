const { prisma } = require("../prisma/prisma-client");

const DiscountController = {
  createDiscount: async (req, res) => {
    const { productId, variantId, season, startsAt, endsAt, percentage } =
      req.body;

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });
      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res.status(403).json({ error: "Нет прав" });
      }

      if (!startsAt || !endsAt) {
        return res
          .status(400)
          .json({ error: "Нужно указать даты начала и конца скидки" });
      }

      const numericPercentage = parseFloat(percentage);
      if (
        isNaN(numericPercentage) ||
        numericPercentage <= 0 ||
        numericPercentage > 100
      ) {
        return res
          .status(400)
          .json({ error: "Неверный процент скидки (от 0 до 100)" });
      }

      const commonDiscountData = {
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        percentage: numericPercentage,
        season: season || null,
        createdById: req.user.userId, // 👈 добавили ID создателя
      };

      let createdDiscounts = [];

      if (season) {
        const products = await prisma.product.findMany({
          where: { season },
        });

        for (const product of products) {
          const discount = await prisma.discount.create({
            data: {
              ...commonDiscountData,
              productId: product.id,
            },
          });
          createdDiscounts.push(discount);
        }
      } else if (productId) {
        const discount = await prisma.discount.create({
          data: {
            ...commonDiscountData,
            productId,
          },
        });
        createdDiscounts.push(discount);
      } else if (variantId) {
        const discount = await prisma.discount.create({
          data: {
            ...commonDiscountData,
            variantId,
          },
        });
        createdDiscounts.push(discount);
      } else {
        return res
          .status(400)
          .json({ error: "Укажите либо сезон, либо товар/вариант" });
      }

      res.json({
        message: `Создано скидок: ${createdDiscounts.length}`,
        discounts: createdDiscounts,
      });
    } catch (error) {
      console.error("createDiscount error:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  },

  getActiveDiscounts: async (req, res) => {
    const now = new Date();
    try {
      const discounts = await prisma.discount.findMany({
        where: {
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        include: {
          product: true,
          variant: true,
          createdBy: true,
        },
      });
      res.json(discounts);
    } catch (error) {
      console.error("getActiveDiscounts error:", error);
      res.status(500).json({ error: "Ошибка при загрузке скидок" });
    }
  },

  deleteDiscount: async (req, res) => {
    const { id } = req.params;
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });
      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      await prisma.discount.delete({ where: { id } });
      res.json({ message: "Скидка удалена" });
    } catch (error) {
      console.error("deleteDiscount error:", error);
      res.status(500).json({ error: "Ошибка при удалении скидки" });
    }
  },

  

  getAllDiscounts: async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });
      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res.status(403).json({ error: "Нет прав" });
      }
      const discounts = await prisma.discount.findMany({
        include: {
          product: true,
          variant: true,
          createdBy: true,
        },
      });

      res.json(discounts);
    } catch (error) {
      console.error("getAllDiscounts error:", error);
      res.status(500).json({ error: "Ошибка при загрузке всех скидок" });
    }
  },
};

module.exports = DiscountController;
