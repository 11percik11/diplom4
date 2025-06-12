const UserController = require('./user');
const ProductController = require('./product-controller');
const LikeController = require('./like-controller');
const CommentController = require('./comment-controller');
const CartController = require('./cart-controller');
const OrderController = require('./orders-controller');
const DiscountController = require('./discount');


module.exports = {
  UserController,
  ProductController,
  LikeController,
  CommentController,
  CartController,
  DiscountController,
  OrderController,
};