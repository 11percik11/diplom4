const express = require('express');
const router = express.Router();
const multer = require('multer');
const { UserController, ProductController, LikeController, CommentController, CartController, OrderController } = require('../controllers');
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const MessageController = require('../controllers/message-controller');

const uploadDestination = 'uploads';

// Показываем, где хранить загружаемые файлы
const storage = multer.diskStorage({
  destination: uploadDestination,
  filename: function (req, file, cb) {
    const fileExt = file.originalname.split('.').pop();
    const uniqueName = uuidv4() + '.' + fileExt; // Генерирует что-то вроде `550e8400-e29b-41d4-a716-446655440000.jpg`
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

router.get('/refresh', UserController.refresh)

router.post('/register', UserController.register)
router.post('/createadmin', UserController.createAdmin)
router.post("/login", UserController.login);
router.post("/activate/:link", UserController.activate);
router.get("/current", authenticateToken, UserController.current);
router.get("/users/:id", authenticateToken, UserController.getUserById);

router.get("/allusers", authenticateToken, UserController.allUsers);

router.put("/users/:id", authenticateToken, upload.single('avatar'), UserController.updateUser);
router.put("/updaterole", authenticateToken, upload.single('avatar'), UserController.updateRole);
router.delete("/deleteuser", authenticateToken, UserController.deleteUser);

// router.post("/product", authenticateToken, upload.array('avatar', 10), ProductController.createProduct, upload.single('avatar'));
router.post(
  "/product",
  authenticateToken,
  upload.fields(
    Array.from({ length: 20 }, (_, i) => ({ name: `${i}`, maxCount: 10 }))
  ),
  ProductController.createProduct
);
router.get("/product", authenticateToken, ProductController.getAllProducts);
router.get("/product/:id", authenticateToken, ProductController.getProductById);
// router.get("/product", ProductController.getAllProducts);
// router.get("/product/:id", ProductController.getProductById);
router.delete("/product/:id", authenticateToken, ProductController.deleteProduct);
// router.put("/product/:id", authenticateToken, upload.array('avatar', 10), ProductController.updateProduct);
router.put(
  "/product/:id",
  authenticateToken,
  upload.fields(
    Array.from({ length: 20 }, (_, i) => ({ name: `${i}`, maxCount: 10 }))
  ),
  ProductController.updateProduct
);

router.post("/likes/rate", authenticateToken, LikeController.rateProduct);
router.delete("/likes", authenticateToken, LikeController.unlikeProduct);
router.delete("/likes/deleteRating", authenticateToken, LikeController.deleteRating);


router.post("/comments/:id", authenticateToken, CommentController.createComment);
router.delete("/comments/:id", authenticateToken, CommentController.deleteComment);
router.delete("/deleteAdminComment/:id", authenticateToken, CommentController.deleteAdminComment);

router.put("/comments/:id", authenticateToken, CommentController.updateComment);

// router.get('/:productid/comments', CommentController.getAllComments);
router.get('/comments/:productid', CommentController.getAllComments);

router.get('/commentsvisable/pending', authenticateToken, CommentController.getPendingComments);
router.put('/comments/moderate/:id', authenticateToken, CommentController.moderateComment);

// router.post("/chat/:id", authenticateToken, ChatController.createChat);

// router.post("/message/:id", authenticateToken, MessageController.createMessage);
// router.put("/message/:id", authenticateToken, MessageController.updateMessage);

router.post('/orders', authenticateToken, OrderController.createOrder);
router.delete('/orders/:id', authenticateToken, OrderController.deleteOrder);
router.get('/orders', authenticateToken, OrderController.getUserOrders);       // Все заказы пользователя
router.get('/orders/:id', authenticateToken, OrderController.getOrderById)
router.post('/orders/check', authenticateToken, OrderController.checkProductAvailability)

router.get('/admin/orders', authenticateToken, OrderController.getAllOrders);
router.get('/admin/orders/user/:userId', authenticateToken, OrderController.getOrdersByUserId);




router.put('/cart', authenticateToken, CartController.addToCart);
router.delete('/cart', authenticateToken, CartController.removeFromCart);
router.get('/cart', authenticateToken, CartController.getCart);
router.put('/cart/update-quantity', authenticateToken, CartController.updateQuantity);

module.exports = router;