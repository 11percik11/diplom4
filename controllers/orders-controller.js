const { prisma } = require("../prisma/prisma-client");

const OrderController = {
createOrder: async (req, res) => {
  try {
    const userId = req.user.userId;
    const { items, deliveryMethod, deliveryAddress } = req.body;

    if (!userId || !Array.isArray(items) || items.length === 0 || !deliveryMethod) {
      return res.status(400).json({ error: "Неверные данные для заказа" });
    }

    let totalPrice = 0;
    const now = new Date();
    const orderItemsData = [];

    const getMaxActiveDiscount = (discounts) => {
      return discounts
        .filter(d => new Date(d.startsAt) <= now && now <= new Date(d.endsAt))
        .reduce((max, d) => Math.max(max, d.percentage), 0);
    };

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          discounts: true,
          variants: {
            where: { id: item.variantId },
            include: { discounts: true },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: `Товар с ID ${item.productId} не найден` });
      }

      const variant = product.variants[0];
      if (!variant) {
        return res.status(404).json({ error: "Вариант товара не найден" });
      }

      const sizeEntry = variant.sizes.find(s => s.size === item.size);
      if (!sizeEntry) {
        return res.status(400).json({ error: `Размер ${item.size} не найден у варианта` });
      }

      if (sizeEntry.quantity < item.quantity) {
        return res.status(400).json({
          error: `Недостаточно товара. Доступно: ${sizeEntry.quantity}, запрошено: ${item.quantity}`,
        });
      }

      const productDiscountValue = getMaxActiveDiscount(product.discounts);
      const variantDiscountValue = getMaxActiveDiscount(variant.discounts);
      const bestDiscount = Math.max(productDiscountValue, variantDiscountValue);

      const discountedPrice = product.price * (1 - bestDiscount / 100);
      const roundedPrice = Math.floor(discountedPrice);
      const itemTotal = roundedPrice * item.quantity;

      console.log(
        `[ORDER] ${product.title}: base ${product.price} ₽, discount ${bestDiscount}% → ${roundedPrice} ₽ x ${item.quantity} = ${itemTotal} ₽`
      );

      totalPrice += itemTotal;

      orderItemsData.push({
        productId: product.id,
        variantId: variant.id,
        quantity: item.quantity,
        size: item.size,
        productTitle: product.title,
        productPrice: roundedPrice,
        productModel: product.model,
        variantColor: variant.color,
      });
    }

    console.log(`[ORDER] Total price for user ${userId}: ${totalPrice} ₽`);

    const order = await prisma.order.create({
      data: {
        userId,
        totalPrice,
        status: "pending",
        deliveryMethod,
        deliveryAddress: deliveryMethod === "courier" ? deliveryAddress : null,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: true,
      },
    });

    for (const item of items) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
      });

      if (!variant) continue;

      const updatedSizes = variant.sizes.map(entry =>
        entry.size === item.size
          ? { ...entry, quantity: entry.quantity - item.quantity }
          : entry
      );

      await prisma.productVariant.update({
        where: { id: item.variantId },
        data: {
          sizes: updatedSizes,
        },
      });
    }

    await prisma.cartItem.deleteMany({
      where: {
        cart: { userId },
        variantId: { in: items.map(i => i.variantId) },
        size: { in: items.map(i => i.size) },
      },
    });

    res.json(order);
  } catch (error) {
    console.error("Ошибка при создании заказа:", error.message, error);
    return res.status(500).json({ error: error.message });
  }
},


  // Проверка наличия товаров для покупки
  checkProductAvailability: async (req, res) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          available: false,
          error: "Неверные данные для проверки товаров",
        });
      }

      for (const item of items) {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.variantId },
          include: {
            product: true, // Чтобы получить product.title
          },
        });

        if (!variant) {
          return res.status(200).json({
            available: false,
            missingItem: {
              variantId: item.variantId,
              reason: "Вариант товара не найден",
            },
          });
        }

        const sizeEntry = variant.sizes.find((s) => s.size === item.size);

        if (!sizeEntry) {
          return res.status(200).json({
            available: false,
            missingItem: {
              variantId: item.variantId,
              productTitle: variant.product?.title,
              size: item.size,
              reason: "Размер не найден",
            },
          });
        }

        if (sizeEntry.quantity < item.quantity) {
          return res.status(200).json({
            available: false,
            missingItem: {
              variantId: item.variantId,
              productTitle: variant.product?.title,
              size: item.size,
              requestedQuantity: item.quantity,
              availableQuantity: sizeEntry.quantity,
              reason: "Недостаточно товара",
            },
          });
        }
      }

      res.status(200).json({ available: true });
    } catch (error) {
      console.error("Ошибка при проверке товаров:", error.message, error);
      res
        .status(500)
        .json({ available: false, error: "Ошибка при проверке товаров" });
    }
  },

  // ❌ Удаление заказа
  deleteOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      // Найти заказ с привязкой к пользователю
      const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }

      if (order.userId !== userId) {
        return res
          .status(403)
          .json({ error: "Вы не авторизованы для удаления этого заказа" });
      }

      // Возврат остатков товаров
      for (const item of order.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              increment: item.quantity,
            },
          },
        });
      }

      // Удалить все связанные позиции заказа
      await prisma.orderItem.deleteMany({ where: { orderId: id } });

      // Удалить сам заказ
      await prisma.order.delete({ where: { id } });

      res.json({ message: "Заказ успешно удалён", orderId: id });
    } catch (error) {
      console.error("Ошибка при удалении заказа:", error.message, error);
      res.status(500).json({ error: "Не удалось удалить заказ" });
    }
  },

  getUserOrders: async (req, res) => {
    try {
      const userId = req.user.userId;

      const orders = await prisma.order.findMany({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
              variant: {
                include: {
                  images: true, // ✅ получаем изображения из варианта
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(orders);
    } catch (error) {
      console.error("Ошибка при получении заказов:", error.message, error);
      res.status(500).json({ error: "Не удалось получить заказы" });
    }
  },

  // Получить один заказ по ID
  getOrderById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }

      if (order.userId !== userId) {
        return res
          .status(403)
          .json({ error: "Вы не авторизованы для просмотра этого заказа" });
      }

      res.json(order);
    } catch (error) {
      console.error("Ошибка при получении заказа по ID:", error.message, error);
      res.status(500).json({ error: "Не удалось получить заказ" });
    }
  },

  getAllOrders: async (req, res) => {
  try {
    const userId = req.user.userId

    // Получить текущего пользователя
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    // ✅ Разрешаем только ADMIN и MANAGER
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
      return res.status(403).json({ error: "Доступ запрещён" })
    }

    const orders = await prisma.order.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: true,
            variant: {
              include: {
                images: true, // ✅ фотографии варианта
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    res.json(orders)
  } catch (error) {
    console.error("Ошибка при получении всех заказов:", error.message, error)
    res.status(500).json({ error: "Не удалось получить все заказы" })
  }
},

  getOrdersByUserId: async (req, res) => {
    try {
      const adminId = req.user.userId;
      const { userId } = req.params;

      // Проверка прав
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
      });

      if (!admin || admin.role !== "ADMIN") {
        return res
          .status(403)
          .json({ error: "Доступ запрещён. Только для администратора." });
      }

      // Получаем заказы указанного пользователя
      const orders = await prisma.order.findMany({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(orders);
    } catch (error) {
      console.error(
        "Ошибка при получении заказов пользователя:",
        error.message,
        error
      );
      res
        .status(500)
        .json({ error: "Не удалось получить заказы пользователя" });
    }
  },

  markOrderAsReady: async (req, res) => {
    try {
      const { id } = req.params;
      const { isReady } = req.body;
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
        return res
          .status(403)
          .json({ error: "Недостаточно прав для действия" });
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          isReady: Boolean(isReady),
        },
      });

      res.json(updatedOrder);
    } catch (error) {
      console.error("Ошибка при обновлении isReady:", error.message, error);
      res.status(500).json({ error: "Не удалось обновить поле isReady" });
    }
  },

  markOrderAsGiven: async (req, res) => {
    try {
      const { id } = req.params;
      const { isGivenToClient } = req.body;
      const userId = req.user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
        return res
          .status(403)
          .json({ error: "Недостаточно прав для действия" });
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          isGivenToClient: Boolean(isGivenToClient),
        },
      });

      res.json(updatedOrder);
    } catch (error) {
      console.error(
        "Ошибка при обновлении isGivenToClient:",
        error.message,
        error
      );
      res
        .status(500)
        .json({ error: "Не удалось обновить поле isGivenToClient" });
    }
  },
};

module.exports = OrderController;
