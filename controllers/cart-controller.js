const { prisma } = require("../prisma/prisma-client");

const CartController = {
  addToCart: async (req, res) => {
    const { productId, variantId, size, quantity } = req.body;
    const userId = req.user.userId;

    if (!productId || !variantId || !size) {
      return res
        .status(400)
        .json({
          error: "Не указаны обязательные поля: productId, variantId или size",
        });
    }

    const requestedQty = Number(quantity) > 0 ? Number(quantity) : 1;

    try {
      // Проверяем, существует ли товар
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        return res.status(404).json({ error: "Продукт не найден" });
      }

      // Проверяем, существует ли указанный вариант
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
      });
      if (!variant) {
        return res.status(404).json({ error: "Вариант товара не найден" });
      }

      // Проверка размера в выбранном варианте
      const sizeEntry = variant.sizes.find((s) => s.size === size);
      if (!sizeEntry) {
        return res
          .status(400)
          .json({ error: `Размер ${size} не найден у выбранного варианта` });
      }

      const availableQty = sizeEntry.quantity;

      // Получаем/создаём корзину
      let cart = await prisma.cart.findFirst({
        where: { userId },
        include: { items: true },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: {
            userId,
            items: { create: [] },
          },
          include: { items: true },
        });
      }

      // Проверка, есть ли уже такой товар с тем же размером и вариантом в корзине
      const existingItem = cart.items.find(
        (item) =>
          item.productId === productId &&
          item.variantId === variantId &&
          item.size === size
      );

      if (existingItem) {
        const totalAfterAdd = existingItem.quantity + requestedQty;
        const finalQuantity = Math.min(totalAfterAdd, availableQty);

        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: finalQuantity },
        });
      } else {
        const finalQuantity = Math.min(requestedQty, availableQty);

        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            variantId,
            size,
            quantity: finalQuantity,
          },
        });
      }

      // Обновлённая корзина
      const updatedCart = await prisma.cart.findUnique({
        where: { id: cart.id },
        include: {
          items: {
            include: {
              product: {
                include: {
                  variants: { include: { images: true } },
                },
              },
            },
          },
        },
      });

      res.json(updatedCart);
    } catch (error) {
      console.error("Ошибка при добавлении в корзину:", error);
      res
        .status(500)
        .json({ error: "Ошибка при добавлении продукта в корзину" });
    }
  },

  // Удаление продукта из корзины
  removeFromCart: async (req, res) => {
    const { itemId } = req.body;
    const userId = req.user.userId;

    if (!itemId) {
      return res.status(400).json({ error: "Не указан ID элемента корзины" });
    }

    try {
      // Проверяем наличие элемента и принадлежность корзине пользователя
      const cartItem = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: { cart: true },
      });

      if (!cartItem || cartItem.cart.userId !== userId) {
        return res
          .status(404)
          .json({ error: "Элемент не найден или доступ запрещён" });
      }

      // Удаляем товар полностью
      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      res.json({ message: "Товар полностью удалён из корзины" });
    } catch (error) {
      console.error("Ошибка при удалении:", error);
      res.status(500).json({ error: "Ошибка при удалении товара из корзины" });
    }
  },

  // Получение корзины пользователя
  getCart: async (req, res) => {
    const userId = req.user.userId;

    try {
      const cart = await prisma.cart.findFirst({
        where: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  variants: {
                    include: {
                      images: true,
                      sizes: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!cart) {
        return res.status(404).json({ error: "Корзина не найдена" });
      }

      res.json(cart);
    } catch (error) {
      console.error("Ошибка при получении корзины:", error);
      res.status(500).json({ error: "Ошибка при получении корзины" });
    }
  },

  updateQuantity: async (req, res) => {
    const { itemId, action } = req.body;
    const userId = req.user.userId;

    if (!itemId || !["increment", "decrement"].includes(action)) {
      return res.status(400).json({ error: "Неверные данные запроса" });
    }

    try {
      const item = await prisma.cartItem.findUnique({
        where: { id: itemId },
        include: {
          cart: true,
          product: {
            include: {
              variants: true, // для доступа к variantId
            },
          },
        },
      });

      if (!item || item.cart.userId !== userId) {
        return res
          .status(404)
          .json({ error: "Элемент не найден или доступ запрещён" });
      }

      // Найдём нужный вариант по variantId
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
      });

      if (!variant) {
        return res.status(404).json({ error: "Вариант товара не найден" });
      }

      // Найдём нужный размер в variant.sizes
      const sizeEntry = variant.sizes.find((s) => s.size === item.size);

      if (!sizeEntry) {
        return res
          .status(400)
          .json({
            error: `Размер ${item.size} не найден у выбранного варианта`,
          });
      }

      if (action === "increment") {
        if (item.quantity >= sizeEntry.quantity) {
          return res.status(400).json({
            error: `На складе только ${sizeEntry.quantity} шт. размера ${item.size}`,
          });
        }

        await prisma.cartItem.update({
          where: { id: itemId },
          data: { quantity: item.quantity + 1 },
        });
      } else {
        if (item.quantity > 1) {
          await prisma.cartItem.update({
            where: { id: itemId },
            data: { quantity: item.quantity - 1 },
          });
        } else {
          await prisma.cartItem.delete({ where: { id: itemId } });
        }
      }

      const updatedCart = await prisma.cart.findUnique({
        where: { id: item.cartId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  variants: {
                    include: { images: true, sizes: true },
                  },
                },
              },
            },
          },
        },
      });

      res.json(updatedCart);
    } catch (error) {
      console.error("Ошибка при обновлении количества:", error);
      res.status(500).json({ error: "Ошибка при обновлении количества" });
    }
  },
};

module.exports = CartController;
