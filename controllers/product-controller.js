const { prisma } = require("../prisma/prisma-client");
const path = require("path");
const Jdenticon = require("jdenticon");
const fs = require("fs");

const ProductController = {
  createProduct: async (req, res) => {
    const { title, description, price, sex, model, age } = req.body;
    let variants = req.body.variants;
    const files = req.files; // { '0': [...], '1': [...], ... } если используешь upload.array("variants[0].images") и т.п.

    if (!variants) {
      return res.status(400).json({ error: "Нужно указать варианты товара" });
    }

    try {
      if (typeof variants === "string") variants = JSON.parse(variants);
      if (!Array.isArray(variants) || variants.length === 0) {
        return res.status(400).json({ error: "variants должен быть массивом" });
      }
    } catch (e) {
      return res.status(400).json({ error: "Неверный формат variants" });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res.status(403).json({ error: "Нет прав" });
      }

      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice)) {
        return res.status(400).json({ error: "Цена должна быть числом" });
      }

      // Создание продукта
      const product = await prisma.product.create({
        data: {
          title,
          description,
          price: numericPrice,
          sex,
          model,
          age,
          userId: req.user.userId,
        },
      });

      // Создание вариантов
      for (let i = 0; i < variants.length; i++) {
        const { color, sizes } = variants[i];

        if (!color || !Array.isArray(sizes) || sizes.length === 0) {
          throw new Error(`Неверные данные для варианта №${i + 1}`);
        }

        const parsedSizes = sizes.map(({ size, quantity }) => {
          if (!size || isNaN(parseInt(quantity))) {
            throw new Error(`Неверный формат размеров в варианте №${i + 1}`);
          }
          return { size, quantity: parseInt(quantity) };
        });

        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            color,
            sizes: parsedSizes,
          },
        });

        const variantImages = files?.[i] || [];
        if (variantImages.length > 0) {
          await prisma.productImage.createMany({
            data: variantImages.map((file) => ({
              variantId: variant.id,
              url: `/uploads/${file.filename}`,
            })),
          });
        }
      }

      res.json({ message: "Товар создан", productId: product.id });
    } catch (error) {
      console.error("Ошибка при создании продукта:", error);
      res.status(500).json({ error: error.message || "Ошибка сервера" });
    }
  },

  // updateProduct: async (req, res) => {
  //   const { id } = req.params;
  //   const {
  //     title,
  //     description,
  //     price,
  //     sex,
  //     model,
  //     age,
  //     variants: rawVariants,
  //   } = req.body;
  //   const files = req.files; // { '0': [...], '1': [...] } - новые файлы для каждого варианта

  updateProduct: async (req, res) => {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      sex,
      model,
      age,
      variants: rawVariants,
    } = req.body;
    const files = req.files; // { '0': [...], '1': [...] } - новые файлы для каждого варианта

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        return res.status(403).json({ error: "Нет прав для изменения товара" });
      }

      const existingProduct = await prisma.product.findUnique({
        where: { id },
        include: {
          variants: {
            include: { images: true },
          },
        },
      });

      if (!existingProduct) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      // Обновляем основные данные продукта
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: {
          title: title ?? existingProduct.title,
          description: description ?? existingProduct.description,
          price: price ? parseFloat(price) : existingProduct.price,
          sex: sex ?? existingProduct.sex,
          model: model ?? existingProduct.model,
          age: age ?? existingProduct.age,
        },
      });

      let variants = rawVariants;
      if (typeof variants === "string") {
        try {
          variants = JSON.parse(variants);
        } catch (e) {
          return res.status(400).json({ error: "Неверный формат variants" });
        }
      }

      if (!Array.isArray(variants)) {
        return res.status(400).json({ error: "variants должен быть массивом" });
      }

      // Обрабатываем варианты
      for (let i = 0; i < variants.length; i++) {
        const variantData = variants[i];
        const { id: variantId, color, sizes, existingImages } = variantData;

        if (!color || !Array.isArray(sizes) || sizes.length === 0) {
          throw new Error(`Неверные данные для варианта №${i + 1}`);
        }

        const parsedSizes = sizes.map(({ size, quantity }) => {
          if (!size || isNaN(parseInt(quantity))) {
            throw new Error(`Неверный формат размеров в варианте №${i + 1}`);
          }
          return { size, quantity: parseInt(quantity) };
        });

        if (variantId) {
          // Обновляем существующий вариант
          await prisma.productVariant.update({
            where: { id: variantId },
            data: {
              color,
              sizes: parsedSizes,
            },
          });

          // Получаем текущие изображения варианта из БД
          const currentImages = await prisma.productImage.findMany({
            where: { variantId },
          });

          // Преобразуем existingImages (объекты) в массив id изображений для сохранения
          const imagesToKeepIds = (existingImages || []).map(img => img.id);

          // Определяем, какие изображения удалить
          const imagesToDelete = currentImages.filter(
            img => !imagesToKeepIds.includes(img.id)
          );

          for (const img of imagesToDelete) {
            // Удаление файла с диска (если нужно)
            const imagePath = path.join(__dirname, `/..${img.url}`);
            fs.unlink(imagePath, err => {
              if (err) console.warn("Ошибка удаления файла", img.url, err);
            });

            // Удаляем запись из базы
            await prisma.productImage.delete({ where: { id: img.id } });
          }

          // Добавляем новые файлы, если они есть
          const variantFiles = files?.[i] || [];
          if (variantFiles.length > 0) {
            await prisma.productImage.createMany({
              data: variantFiles.map((file) => ({
                variantId,
                url: `/uploads/${file.filename}`,
              })),
            });
          }
        } else {
          // Создаем новый вариант
          const newVariant = await prisma.productVariant.create({
            data: {
              productId: id,
              color,
              sizes: parsedSizes,
            },
          });

          // Добавляем файлы для нового варианта
          const variantFiles = files?.[i] || [];
          if (variantFiles.length > 0) {
            await prisma.productImage.createMany({
              data: variantFiles.map((file) => ({
                variantId: newVariant.id,
                url: `/uploads/${file.filename}`,
              })),
            });
          }
        }
      }

      // TODO: можно дополнительно удалить варианты, отсутствующие в incoming variants

      res.json({ message: "Товар обновлён", product: updatedProduct });
    } catch (error) {
      console.error("Ошибка при обновлении товара:", error);
      res.status(500).json({ error: error.message || "Ошибка сервера" });
    }
  },

  getAllProducts: async (req, res) => {
    const userId = req.user?.userId;

    const {
      minPrice,
      maxPrice,
      color,
      size,
      sex,
      model,
      age,
      search,
      minSize,
      maxSize,
    } = req.query;

    try {
      const filters = {};

      // Фильтр по цене
      if (minPrice || maxPrice) {
        filters.price = {
          ...(minPrice && { gte: parseFloat(String(minPrice)) }),
          ...(maxPrice && { lte: parseFloat(String(maxPrice)) }),
        };
      }

      // Фильтры по полю Product
      if (sex) filters.sex = sex;
      if (model) filters.model = model;
      if (age) filters.age = age;

      // Поиск по названию или описанию
      if (search) {
        filters.OR = [
          { title: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } },
        ];
      }

      // Основной запрос с вложенной фильтрацией по variants
      const products = await prisma.product.findMany({
        where: {
          ...filters,
          variants: {
            some: {
              ...(color && { color: String(color) }),
              ...(size && {
                sizes: {
                  some: {
                    size: String(size),
                  },
                },
              }),
              ...((minSize || maxSize) && {
                sizes: {
                  some: {
                    size: {
                      ...(minSize && { gte: String(minSize) }),
                      ...(maxSize && { lte: String(maxSize) }),
                    },
                  },
                },
              }),
            },
          },
        },
        include: {
          user: true,
          likes: true,
          comments: true,
          variants: {
            include: {
              images: true,
              sizes: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const filteredProducts = products
        .map((product) => {
          // Если фильтра по цвету нет — ничего не меняем
          if (!color) return product;

          // Фильтруем только подходящие варианты
          const matchingVariants = product.variants.filter(
            (variant) => variant.color === color
          );

          return {
            ...product,
            variants: matchingVariants.length > 0 ? matchingVariants : [], // можно [] или оставить все, если ничего не нашли
          };
        })
        .filter((p) => p.variants.length > 0);

      const postsWithLikeInfo = products.map((product) => ({
        product,
        likedByUser: userId
          ? product.likes.some((like) => like.userId === userId)
          : false,
      }));

      res.json(
        filteredProducts.map((product) => ({
          product,
          likedByUser: userId
            ? product.likes.some((like) => like.userId === userId)
            : false,
        }))
      );
    } catch (err) {
      console.error("Ошибка при получении продуктов:", err.message, err);
      res
        .status(500)
        .json({ error: "Произошла ошибка при получении продуктов" });
    }
  },

  getProductById: async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.userId || null;

    try {
      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          user: true,
          likes: true,
          variants: {
            include: {
              images: true,
              sizes: true,
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      const commentWhere = {
        productId: id,
      };

      if (userId) {
        commentWhere.OR = [{ visible: true }, { userId: userId }];
      } else {
        commentWhere.visible = true;
      }

      const comments = await prisma.comment.findMany({
        where: commentWhere,
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

      const productWithLikeInfo = {
        ...product,
        likedByUser: userId
          ? product.likes.some((like) => like.userId === userId)
          : false,
        comments,
      };

      res.json(productWithLikeInfo);
    } catch (error) {
      console.error("Ошибка при получении товара:", error.message, error);
      res.status(500).json({ error: "Произошла ошибка при получении товара" });
    }
  },

  // deleteProduct: async (req, res) => {
  //   const { id } = req.params;

  //   try {
  //     const user = await prisma.user.findUnique({
  //       where: { id: req.user.userId },
  //     });

  //     if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
  //       return res
  //         .status(403)
  //         .json({ error: "У вас нет прав для удаления продукта" });
  //     }

  //     const product = await prisma.product.findUnique({
  //       where: { id },
  //       include: {
  //         variants: {
  //           include: {
  //             images: true,
  //           },
  //         },
  //       },
  //     });

  //     if (!product) {
  //       return res.status(404).json({ error: "Товар не найден" });
  //     }

  //     // Удаление файлов изображений с диска
  //     for (const variant of product.variants) {
  //       for (const image of variant.images) {
  //         const imagePath = path.join(__dirname, `/..${image.url}`);
  //         fs.unlink(imagePath, (err) => {
  //           if (err) {
  //             console.warn("Не удалось удалить файл:", image.url, err.message);
  //           } else {
  //             console.log("Файл удалён:", image.url);
  //           }
  //         });
  //       }
  //     }

  //     // Удаление связанных записей и самого продукта в одной транзакции
  //     const transaction = await prisma.$transaction([
  //       prisma.comment.deleteMany({ where: { productId: id } }),
  //       prisma.like.deleteMany({ where: { productId: id } }),
  //       prisma.cartItem.deleteMany({ where: { productId: id } }),
  //       prisma.orderItem.deleteMany({ where: { productId: id } }),
  //       prisma.productVariant.deleteMany({ where: { productId: id } }), // 🆕 удалить варианты
  //       prisma.product.delete({ where: { id } }),
  //     ]);

  //     res.json({ success: true, details: transaction });
  //   } catch (error) {
  //     console.error("Ошибка при удалении товара:", error);
  //     res
  //       .status(500)
  //       .json({ error: "Что-то пошло не так при удалении товара" });
  //   }
  // },

  deleteProduct: async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return res.status(403).json({ error: "У вас нет прав для удаления продукта" });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    // Удаление файлов изображений с диска
    for (const variant of product.variants) {
      for (const image of variant.images) {
        const imagePath = path.join(__dirname, `/..${image.url}`);
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.warn("Не удалось удалить файл:", image.url, err.message);
          } else {
            console.log("Файл удалён:", image.url);
          }
        });
      }
    }

    // Транзакция с удалением связанных данных в правильном порядке
    const transaction = await prisma.$transaction([
      prisma.comment.deleteMany({ where: { productId: id } }),
      prisma.like.deleteMany({ where: { productId: id } }),
      prisma.cartItem.deleteMany({ where: { productId: id } }),
      prisma.orderItem.deleteMany({ where: { productId: id } }),
      // Сначала удаляем изображения вариантов, чтобы не нарушить ограничения связей
      prisma.productImage.deleteMany({ where: { variant: { productId: id } } }),
      // Затем удаляем варианты
      prisma.productVariant.deleteMany({ where: { productId: id } }),
      // И только потом удаляем сам продукт
      prisma.product.delete({ where: { id } }),
    ]);

    res.json({ success: true, details: transaction });
  } catch (error) {
    console.error("Ошибка при удалении товара:", error);
    res.status(500).json({ error: "Что-то пошло не так при удалении товара" });
  }
},
};

module.exports = ProductController;
