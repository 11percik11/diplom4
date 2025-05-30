const UserController = require('./user');
const ProductController = require('./product-controller');
const LikeController = require('./like-controller');
const CommentController = require('./comment-controller');
// const ChatController = require('./chat-controller');
// const MessageController = require('./message-controller');
const CartController = require('./cart-controller');
const OrderController = require('./orders-controller');


module.exports = {
  UserController,
  ProductController,
  // PostController,
  // FollowController,
  LikeController,
  CommentController,
  CartController,

  OrderController,
};