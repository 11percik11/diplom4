const { prisma } = require("../prisma/prisma-client");
const path = require("path");
const Jdenticon = require("jdenticon");
const fs = require("fs");

const ProductController = {


  createProduct: async (req, res) => {
  const { title, description, price, sex, model, age, season } = req.body; // Добавляем поле season
  let variants = req.body.variants;
  const files = req.files;


  if (!variants) {
    return res.status(400).json({ error: "Нужно указать варианты товара" });
  }

  // Проверка правильности формата variants
  try {
    if (typeof variants === "string") variants = JSON.parse(variants);
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ error: "variants должен быть массивом" });
    }
  } catch (e) {
    return res.status(400).json({ error: "Неверный формат variants" });
  }

  // Проверка наличия сезона (season)
  if (!season || !["SUMMER", "WINTER", "ALL_SEASON"].includes(season)) {
    return res.status(400).json({ error: "Неверное значение сезона, допустимые значения: SUMMER, WINTER, ALL_SEASON" });
  }

  try {
    // Получение пользователя
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return res.status(403).json({ error: "Нет прав" });
    }

    // Проверка правильности цены
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice)) {
      return res.status(400).json({ error: "Цена должна быть числом" });
    }

    // Создание товара с учетом сезона
    const product = await prisma.product.create({
      data: {
        title,
        description,
        price: numericPrice,
        sex,
        model,
        age,
        season, // Добавляем сезон
        userId: req.user.userId,
      },
    });

    // Создание вариантов
    for (let i = 0; i < variants.length; i++) {
      const { color, sizes } = variants[i];

      if (!color || !Array.isArray(sizes) || sizes.length === 0) {
        throw new Error(`Неверные данные для варианта №${i + 1}`);
      }

      // Проверка и парсинг размеров
      const parsedSizes = sizes.map(({ size, quantity }) => {
        if (!size || isNaN(parseInt(quantity))) {
          throw new Error(`Неверный формат размеров в варианте №${i + 1}`);
        }
        return { size, quantity: parseInt(quantity) };
      });

      // Создание варианта товара
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          color,
          sizes: parsedSizes,
        },
      });

      // Обработка изображений для варианта
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



  updateProduct: async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    price,
    sex,
    model,
    age,
    season,
    visible, // ✅ Добавлено поле видимости
    variants: rawVariants,
  } = req.body;
  const files = req.files; // { '0': [...], '1': [...] }

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

    // Обновляем основные данные продукта, включая visible и season
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        title: title ?? existingProduct.title,
        description: description ?? existingProduct.description,
        price: price ? parseFloat(price) : existingProduct.price,
        sex: sex ?? existingProduct.sex,
        model: model ?? existingProduct.model,
        age: age ?? existingProduct.age,
        season: season ?? existingProduct.season,
        ...(typeof visible !== "undefined"
          ? { visible: visible === "true" || visible === true }
          : {}), // ✅ Обработка visible
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

    // Обработка вариантов
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
        // Обновляем вариант
        await prisma.productVariant.update({
          where: { id: variantId },
          data: {
            color,
            sizes: parsedSizes,
          },
        });

        // Обрабатываем изображения
        const currentImages = await prisma.productImage.findMany({
          where: { variantId },
        });

        const imagesToKeepIds = (existingImages || []).map(img => img.id);

        const imagesToDelete = currentImages.filter(
          img => !imagesToKeepIds.includes(img.id)
        );

        for (const img of imagesToDelete) {
          const imagePath = path.join(__dirname, `/..${img.url}`);
          fs.unlink(imagePath, err => {
            if (err) console.warn("Ошибка удаления файла", img.url, err);
          });
          await prisma.productImage.delete({ where: { id: img.id } });
        }

        const variantFiles = files?.[i] || [];
        if (variantFiles.length > 0) {
          await prisma.productImage.createMany({
            data: variantFiles.map(file => ({
              variantId,
              url: `/uploads/${file.filename}`,
            })),
          });
        }
      } else {
        // Создаём новый вариант
        const newVariant = await prisma.productVariant.create({
          data: {
            productId: id,
            color,
            sizes: parsedSizes,
          },
        });

        const variantFiles = files?.[i] || [];
        if (variantFiles.length > 0) {
          await prisma.productImage.createMany({
            data: variantFiles.map(file => ({
              variantId: newVariant.id,
              url: `/uploads/${file.filename}`,
            })),
          });
        }
      }
    }

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
    season,
    sort,
  } = req.query;

  try {
    const filters = {};

    if (minPrice || maxPrice) {
      filters.price = {
        ...(minPrice && { gte: parseFloat(String(minPrice)) }),
        ...(maxPrice && { lte: parseFloat(String(maxPrice)) }),
      };
    }

    if (sex) filters.sex = sex;
    if (model) filters.model = model;
    if (age) filters.age = age;
    if (season) filters.season = season;

    if (search) {
      filters.OR = [
        { title: { contains: String(search), mode: "insensitive" } },
        { description: { contains: String(search), mode: "insensitive" } },
      ];
    }

    const orderBy = (() => {
      if (sort === "priceAsc") return { price: "asc" };
      if (sort === "priceDesc") return { price: "desc" };
      if (sort === "old") return { createdAt: "asc" };
      return { createdAt: "desc" };
    })();

    const products = await prisma.product.findMany({
      where: {
        visible: true,
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
        discounts: true,
        variants: {
          include: {
            images: true,
            sizes: true,
            discounts: true,
          },
        },
      },
      orderBy,
    });

    const now = new Date();

    const filteredProducts = products
      .map((product) => {
        const matchingVariants = !color
          ? product.variants
          : product.variants.filter((variant) => variant.color === color);

        const productDiscount = product.discounts.find(
          (d) => new Date(d.startsAt) <= now && new Date(d.endsAt) >= now
        );

        const updatedVariants = matchingVariants.map((variant) => {
          const variantDiscount = variant.discounts.find(
            (d) => new Date(d.startsAt) <= now && new Date(d.endsAt) >= now
          );

          return {
            ...variant,
            activeDiscount: variantDiscount || null,
          };
        });

        return {
          ...product,
          variants: updatedVariants,
          activeDiscount: productDiscount || null,
        };
      })
      .filter((p) => p.variants.length > 0);

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
    res.status(500).json({ error: "Произошла ошибка при получении продуктов" });
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
        discounts: true,
        variants: {
          include: {
            images: true,
            sizes: true,
            discounts: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    // Фильтруем активные скидки на продукт
    const now = new Date();

    const activeProductDiscount = product.discounts.find(
      (d) => new Date(d.startsAt) <= now && new Date(d.endsAt) >= now
    );

    // Или проверяем на скидки по вариантам
    let activeVariantDiscount = null;
    for (const variant of product.variants) {
      const match = variant.discounts.find(
        (d) => new Date(d.startsAt) <= now && new Date(d.endsAt) >= now
      );
      if (match) {
        activeVariantDiscount = match;
        break;
      }
    }

    const commentWhere = {
      productId: id,
    };

    if (userId) {
      commentWhere.OR = [{ visible: true }, { userId }];
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

    const productWithDetails = {
      ...product,
      likedByUser: userId
        ? product.likes.some((like) => like.userId === userId)
        : false,
      comments,
      activeDiscount: activeProductDiscount || activeVariantDiscount || null,
    };

    res.json(productWithDetails);
  } catch (error) {
    console.error("Ошибка при получении товара:", error.message, error);
    res.status(500).json({ error: "Произошла ошибка при получении товара" });
  }
},


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

    const transaction = await prisma.$transaction([
      prisma.comment.deleteMany({ where: { productId: id } }),
      prisma.like.deleteMany({ where: { productId: id } }),
      prisma.cartItem.deleteMany({ where: { productId: id } }),
      prisma.orderItem.deleteMany({ where: { productId: id } }),
      prisma.productImage.deleteMany({ where: { variant: { productId: id } } }),
      prisma.productVariant.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);

    res.json({ success: true, details: transaction });
  } catch (error) {
    console.error("Ошибка при удалении товара:", error);
    res.status(500).json({ error: "Что-то пошло не так при удалении товара" });
  }
},

getAllProductsForAdmin: async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    const products = await prisma.product.findMany({
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

    res.json(products);
  } catch (error) {
    console.error("Ошибка при получении всех продуктов для админа:", error);
    res.status(500).json({ error: "Ошибка сервера при получении продуктов" });
  }
},
};

module.exports = ProductController;
